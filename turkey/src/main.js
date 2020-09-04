const Apify = require('apify');
const httpRequest = require('@apify/http-request');
const LATEST = 'LATEST';

Apify.main(async () => {
  const kvStore = await Apify.openKeyValueStore("COVID-19-TURKEY");
  const dataset = await Apify.openDataset("COVID-19-TURKEY-HISTORY");

        const { body: turkey } = await httpRequest({
        url: 'https://covid19.saglik.gov.tr/covid19api?getir=sondurum',
        json: true,
    })

const tested = turkey[0].toplam_test;
const infected = turkey[0].toplam_vaka;
const deceased = turkey[0].toplam_vefat;
const recovered = turkey[0].toplam_iyilesen;
const critical = turkey[0].agir_hasta_sayisi;
const ICU = turkey[0].toplam_yogun_bakim;

const dailyTested = turkey[0].gunluk_test;
const dailyInfected = turkey[0].gunluk_vaka;
const dailyDeceased = turkey[0].gunluk_vefat;
const dailyRecovered = turkey[0].gunluk_iyilesen;


const now = new Date();

const toInt = (str) => Number(str.replace('.','').replace('.', ''));

 const result = {
     infected: toInt(infected),
     deceased: toInt(deceased),
     recovered: toInt(recovered),
     tested: toInt(tested),
     critical: toInt(critical),
     ICU: toInt(ICU),
     dailyTested: toInt(dailyTested),
     dailyInfected: toInt(dailyInfected),
     dailyDeceased: toInt(dailyDeceased),
     dailyRecovered: toInt(dailyRecovered),
     sourceUrl: 'https://www.worldometers.info/coronavirus/',
     lastUpdateresultpify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
     readMe: 'https://apify.com/onidivo/covid-ir',
 }

 console.log(result)

 // Push the data
 let latest = await kvStore.getValue(LATEST);
 if (!latest) {
     await kvStore.setValue('LATEST', result);
     latest = result;
 }
 delete latest.lastUpdatedAtApify;
 const actual = Object.assign({}, result);
 delete actual.lastUpdatedAtApify;

 if (JSON.stringify(latest) !== JSON.stringify(actual)) {
     await dataset.pushData(result);
 }

 await kvStore.setValue('LATEST', result);
 await Apify.pushData(result);

 console.log('Done.');
});