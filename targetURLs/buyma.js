const puppeteer = require('puppeteer');
const dayjs = require('dayjs');

const TemporaryOtherSellerProductCount = require('../models/temporaryOtherSellerProductCount');
const OtherSellerProductTodayCount = require('../models/otherSellerProductTodayCount');
const OtherSellerProduct = require('../models/otherSellerProduct');
const OtherSeller = require('../models/otherSeller');
require('dotenv').config();

// buyma 데이터 크롤링
async function buyma() {
  let startTime = new Date().getTime();
  let productIdArrTotalCount = 0;
  let dbTemArrTotalCount = 0;
  let dbTemUpdateArrTotalCount = 0;
  let dbTodayArrTotalCount = 0;
  let browser = {};
  let page = {};

  try {
    console.log('otherSeller테이블의 다른판매자ID데이터 취득시작.');
    let objOfOtherSellerIdArr = [];
    let otherSellerIdArr = [];
    otherSellerIdArr = await getOtherSellerIdArr(objOfOtherSellerIdArr, otherSellerIdArr);
    console.log('otherSeller테이블의 다른판매자ID데이터 취득종료.');

    for (let k = 0; k < otherSellerIdArr.length; k++) {
      let oneSellerStartTime = new Date().getTime();
      console.log('OtherSellerProduct테이블의 상품ID데이터 취득시작.');
      let objOfproductIdArr = [];
      let productIdArr = [];
      productIdArr = await getProductIdArr(objOfproductIdArr, productIdArr, otherSellerIdArr, k);
      console.log('OtherSellerProduct테이블의 상품ID데이터 취득종료.');

      // 총 배열 나누기.
      let arrayDivideTotalNum = process.env.ARRAY_DIVIED_TOTAL_NUM || arrayDivideTotalNum;
      let arrayDivideNum = process.env.ARRAY_DIVIED_NUM || arrayDivideNum;
      let productIdArr1ofNNum = Math.floor(productIdArr.length / Number(arrayDivideTotalNum));
      let obj = {};
      let productIdArrSliceNofN;
      productIdArr = await getProductIdArrSlice(
        arrayDivideTotalNum,
        arrayDivideNum,
        productIdArr1ofNNum,
        obj,
        productIdArrSliceNofN,
        productIdArr,
      );

      browser = await puppeteer.launch({
        headless: true,
        args: [
          // '--window-size=1920,1080',
          // '--disable-notifications',
          '--no-sandbox',
          '--disable-setuid-sandbox',
        ],
      });

      let totalProducts = [];
      let tabOpenNum = Number(process.env.TAB_OPEN_NUM || tabOpenNum);

      for (let i = 0; i < productIdArr.length; i += tabOpenNum) {
        console.log('총 갯수 : ' + productIdArr.length + '\n' + (i + 1) + '번째');

        let sliceTabArr = productIdArr.slice(i, i + tabOpenNum);
        await Promise.all(
          sliceTabArr.map(async (v) => {
            let page = await browser.newPage();
            // await page.setViewport({
            //   width: 1480,
            //   height: 1080,
            // });
            console.log(`https://www.buyma.com/item/${v}/ 페이지에 이동`);
            totalProducts = await doCrawlingAndgetTotalProducts(v, page, totalProducts);
            console.log(`https://www.buyma.com/item/${v}/ 페이지 종료`);
          }),
        ).catch((err) => {
          console.log('Error in Promises.all: ', err);
        });
      }
      await browser.close();
      console.log('데이터 크롤링 종료.');

      //test
      let dbTemArr = [];
      let dbTodayArr = [];
      let wish = 0;
      let access = 0;
      for (let product of totalProducts) {
        if (product.buymaProductId) {
          try {
            let result = await TemporaryOtherSellerProductCount.findOne({
              where: { buyma_product_id: product.buymaProductId },
            });

            let dbDate = dayjs().format('YYYY/MM/DD HH:mm:ss');
            let today = dayjs().format('YYYY/MM/DD HH:mm:ss');
            if (!result) {
              let dbTemObj = {};
              dbTemObj.buyma_product_id = product.buymaProductId;
              dbTemObj.buyma_product_name = product.buymaProductName;
              dbTemObj.today = today;
              dbTemObj.wish = product.wish;
              dbTemObj.access = product.access;
              dbTemObj.create_id = 'crawling';
              dbTemObj.date_created = dbDate;
              dbTemObj.update_id = 'crawling';
              dbTemObj.last_updated = dbDate;
              dbTemArr.push(dbTemObj);
            } else {
              dbTemUpdateArrTotalCount++;
              await TemporaryOtherSellerProductCount.update(
                {
                  wish: product.wish,
                  access: product.access,
                  update_id: 'crawling',
                  last_updated: dbDate,
                },
                { where: { buyma_product_id: product.buymaProductId } },
              );

              wish = Number(product.wish) - Number(result.wish);
              access = Number(product.access) - Number(result.access);
            }

            let dbTodayObj = {};
            dbTodayObj.other_seller_product_id = otherSellerIdArr[k];
            dbTodayObj.buyma_product_id = product.buymaProductId;
            dbTodayObj.buyma_product_name = product.buymaProductName;
            dbTodayObj.today = today;
            dbTodayObj.wish = wish;
            dbTodayObj.access = access;
            dbTodayObj.link = product.link;
            dbTodayObj.create_id = 'crawling';
            dbTodayObj.date_created = dbDate;
            dbTodayObj.update_id = 'crawling';
            dbTodayObj.last_updated = dbDate;
            dbTodayArr.push(dbTodayObj);
          } catch (error) {
            console.log('DB처리 에러 : ', error);
          }
        }
      }

      console.log('TemporaryOtherSellerProductCount테이블에 오늘 데이터 등록시작.');
      if (dbTemArr.length > 0) {
        dbTemArrTotalCount = dbTemArrTotalCount + dbTemArr.length;
        try {
          await TemporaryOtherSellerProductCount.bulkCreate(dbTemArr);
        } catch (error) {
          console.log('DB처리 에러 : ', error);
        }
      }
      console.log('TemporaryOtherSellerProductCount테이블에 오늘 데이터 등록종료.');

      console.log('OtherSellerProductTodayCount테이블에 증가데이터 입력시작.');
      if (dbTodayArr.length > 0) {
        dbTodayArrTotalCount = dbTodayArrTotalCount + dbTodayArr.length;
        try {
          await OtherSellerProductTodayCount.bulkCreate(dbTodayArr);
        } catch (error) {
          console.log('DB처리 에러 : ', error);
        }
      }
      console.log('OtherSellerProductTodayCount테이블에 증가데이터 입력종료.');

      productIdArrTotalCount = productIdArrTotalCount + productIdArr.length;
      let oneSellerEndTime = new Date().getTime();
      console.log(
        'buyma_user_id ( ' + otherSellerIdArr[k] + ' ) 가 ' + '총 걸린시간 : ',
        (((oneSellerEndTime - oneSellerStartTime) / (1000 * 60)) % 60) + '분',
      );
    }
    console.log('총 Temporary테이블에 insert 건수 : ' + dbTemArrTotalCount + '건');
    console.log('총 Temporary테이블에 update 건수 : ' + dbTemUpdateArrTotalCount + '건');
    console.log('총 Today테이블에 insert 건수 : ' + dbTodayArrTotalCount + '건');
    console.log('총 크롤링 건 수 : ', productIdArrTotalCount + '건');
    let endTime = new Date().getTime();
    console.log('총 걸린시간 : ', (((endTime - startTime) / (1000 * 60)) % 60) + '분');
  } catch (e) {
    console.log(e);
    await page.close();
    await browser.close();
  }
}

async function getOtherSellerIdArr(objOfOtherSellerIdArr, otherSellerIdArr) {
  try {
    objOfOtherSellerIdArr = await OtherSeller.findAll({
      attributes: ['buyma_user_id'],
    });
  } catch (e) {
    console.log('otherSeller select all error', e);
  }
  for (otherSellerObj of objOfOtherSellerIdArr) {
    otherSellerIdArr.push(otherSellerObj.buyma_user_id);
  }
  return otherSellerIdArr;
}

async function getProductIdArr(objOfproductIdArr, productIdArr, otherSellerIdArr, k) {
  try {
    objOfproductIdArr = await OtherSellerProduct.findAll({
      attributes: ['other_seller_id', 'buyma_product_id'],
      where: { other_seller_id: otherSellerIdArr[k] },
    });
  } catch (e) {
    console.log('OtherSellerProduct select all error', e);
  }
  // [{buyma_product_id: '123123'},{buyma_product_id: '123123'}...] ==> ['123123','123123'..]
  for (productIdObj of objOfproductIdArr) {
    productIdArr.push(productIdObj.buyma_product_id);
  }
  return productIdArr;
}

async function doCrawlingAndgetTotalProducts(v, page, totalProducts) {
  await page.setDefaultNavigationTimeout(0);
  let response = await page.goto(`https://www.buyma.com/item/${v}/`, {
    waitUntil: 'networkidle0',
  });
  if (!response) {
    throw 'Failed to load page!';
  }

  // 데이터 크롤링
  let buymaProductId = v;
  product = await page.evaluate((buymaProductId) => {
    let product = {};
    product.buymaProductId = buymaProductId;
    product.buymaProductName =
      document.querySelector('#content h1') && document.querySelector('#content h1').textContent;
    product.wish =
      (document.querySelector('.topMenuWrap ul li:nth-of-type(2) span') &&
        document
          .querySelector('.topMenuWrap ul li:nth-of-type(2) span')
          .textContent.replace(/,|人/g, '')) ??
      '0';
    product.access =
      (document.querySelector('.topMenuWrap ul li:nth-of-type(1) a') &&
        document
          .querySelector('.topMenuWrap ul li:nth-of-type(1) a')
          .textContent.replace(/,/g, '')) ??
      '0';
    product.link = `https://www.buyma.com/item/${buymaProductId}`;
    return product;
  }, buymaProductId);
  totalProducts.push(product);
  await page.close();
  return totalProducts;
}

async function getProductIdArrSlice(
  arrayDivideTotalNum,
  arrayDivideNum,
  productIdArr1ofNNum,
  obj,
  productIdArrSliceNofN,
  productIdArr,
) {
  if (Number(arrayDivideNum) < Number(productIdArr1ofNNum)) {
    for (let i = 1; i <= Number(arrayDivideTotalNum); i++) {
      if (i == Number(arrayDivideTotalNum)) {
        // 총 배열 나눔 갯수(10개) 와 i=10 인 경우, 예를들어 마지막 배열
        productIdArrSliceNofN = productIdArr.slice(
          productIdArr1ofNNum * (i - 1),
          productIdArr.length,
        );
        // obj에 10등분한 객체를 담기
        obj['productIdArrSlice' + i] = productIdArrSliceNofN;
      } else {
        // 총 배열 나눔 갯수(10개) 와 i!=10 인 경우, 예를들어 마지막 배열를 제외하고
        productIdArrSliceNofN = productIdArr.slice(
          productIdArr1ofNNum * (i - 1),
          productIdArr1ofNNum * i,
        );
        // obj에 10등분한 객체를 담기
        obj['productIdArrSlice' + i] = productIdArrSliceNofN;
      }
    }
  } else {
    obj['productIdArrSlice' + arrayDivideNum] = productIdArr;
  }
  // productIdArr에 해당arrayDivideNum의 부분을 담기
  for (let i = 1; i <= Number(arrayDivideTotalNum); i++) {
    if (Number(arrayDivideNum) == i) return (productIdArr = obj['productIdArrSlice' + i]);
  }
}

module.exports.buyma = buyma;
