const Apify = require('apify');
const httpRequest = require('@apify/http-request');

Apify.main(async () => {
    // get worldometerData and assign it to respective variable
    const { body: worldometerDataRaw } = await httpRequest({
        url: 'https://api.apify.com/v2/key-value-stores/SmuuI0oebnTWjRTUh/records/LATEST?disableRedirect=true',
        json: true,
    })

let result = worldometerDataRaw.regionData[17];

    for (i in worldometerDataRaw.regionData) {
        console.log(i.country)
        if (i.country === 'World') {
            result = i
        };
    console.log(result);
    }});