const Apify = require('apify');
const httpRequest = require('@apify/http-request');

Apify.main(async () => {
    const { email } = await Apify.getInput();
    // get aggregatorData and assign it to respective variable
    const { body: aggregatorData } = await httpRequest({
        url: 'https://api.apify.com/v2/key-value-stores/tVaYRsPHLjNdNBu7S/records/LATEST?disableRedirect=true',
        json: true,
    });
    // get worldometerData and assign it to respective variable
    const { body: worldometerDataRaw } = await httpRequest({
        url: 'https://api.apify.com/v2/key-value-stores/SmuuI0oebnTWjRTUh/records/LATEST?disableRedirect=true',
        json: true,
    });
    const worldometerData = worldometerDataRaw.regionData;

    // create an array of keys from aggregatorData
    const keys = aggregatorData.map(e => e.country);

    // we'll assign the values here
    const result = {};

    // for each key (country from the set we created)
    for (const key of keys) {
        result[key] = {}; // create an object first with a selected key
        const adItem = aggregatorData.find(item => item.country === key);
        const wmItem = worldometerData.find(item => item.country === key);
        // now let's save the found values (if found, otherwise null)
        result[key].infected = adItem ? adItem.infected : null;
        result[key].totalCases = wmItem ? wmItem.totalCases : null;
    }

    let highDeviation = false;
    // let's iterate through each key and save the deviation if entry was present in both files
    for (const key of Object.keys(result)) {
        if (result[key].totalCases && result[key].infected) {
            // that's just a rough calculation - difference vs one of the values
            result[key].deviation = (result[key].totalCases - result[key].infected) / result[key].infected * 100;
        } else {
            // or just save null
            result[key].deviation = null;
        }
        // mark if the deviation is over 5% for at least one of the counties
        if (result[key].deviation && Math.abs(result[key].deviation) >= 5) highDeviation = true;
    }
    
    // await Apify.pushData('result');

    // if there's at least one country with deviation over 5%
    if (highDeviation) {
        // Then we save report to OUTPUT
        // await Apify.setValue('OUTPUT', result);
        await Apify.setValue('OUTPUT', result.filter(x => (x.deviation > 0 || x.deviation < 0 )));
        try {
            const env = Apify.getEnv();
            // And send email with the link to this report
            await Apify.call('apify/send-mail', {
                to: email,
                subject: 'COVID-19 Statistics Checker found deviation over 5% for some countries',
                html: `H!.${'<br/>'}Some countries have deviation over 5% between Aggregator and Worldometer Data.${'<br/>'}Details <a href="https://api.apify.com/v2/key-value-stores/${env.defaultKeyValueStoreId}/records/OUTPUT?disableRedirect=true">here</a>.`,
            }, { waitSecs: 0 });
        } catch (e) {}
    }
});
