const Apify = require('apify');
const httpRequest = require('@apify/http-request');

Apify.main(async () => {
    // get worldometerData and assign it to respective variable
    const { body: worldometerDataRaw } = await httpRequest({
        url: 'https://api.apify.com/v2/key-value-stores/SmuuI0oebnTWjRTUh/records/LATEST?disableRedirect=true',
        json: true,
    })

let result = worldometerDataRaw.regionData.find(c => c.country === 'Iran')
const infected = result.totalCases;
const deceased = result.totalDeaths;
const recovered = result.totalRecovered;
const activeCases = result.activeCases;
const tested = result.totalTests;
const critical = result.seriousCritical;

 const data = {
     infected,
     deceased,
     recovered,
     activeCases,
     tested,
     critical
 }

 console.log(data)
    });