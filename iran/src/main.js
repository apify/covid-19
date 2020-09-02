const Apify = require('apify');
const httpRequest = require('@apify/http-request');
const LATEST = 'LATEST';


Apify.main(async () => {

  const kvStore = await Apify.openKeyValueStore("COVID-19-IRAN");
  const dataset = await Apify.openDataset("COVID-19-IRAN-HISTORY");

    // get worldometerData and assign it to respective variable
    const { body: worldometerDataRaw } = await httpRequest({
        url: 'https://api.apify.com/v2/key-value-stores/SmuuI0oebnTWjRTUh/records/LATEST?disableRedirect=true',
        json: true,
    })

let iran = worldometerDataRaw.regionData.find(c => c.country === 'Iran')
const infected = iran.totalCases;
const deceased = iran.totalDeaths;
const recovered = iran.totalRecovered;
const activeCases = iran.activeCases;
const tested = iran.totalTests;
const critical = iran.seriousCritical;

const now = new Date();

 const result = {
     infected,
     deceased,
     recovered,
     activeCases,
     tested,
     critical,
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