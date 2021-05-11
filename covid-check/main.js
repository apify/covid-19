const Apify = require('apify');
const httpRequest = require('@apify/http-request');

Apify.main(async () => {
    // const { email } = await Apify.getInput();
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
        const countries = {
            "Czech Republic": "Czechia",
            "United Kingdom": "UK",
            "United States": "USA",
            "South Korea": "S. Korea"
        }
        result[key] = {}; // create an object first with a selected key
        const adItem = aggregatorData.find(item => item.country === key);
        // const adItem = aggregatorData.find(item => item.country === key || item.country === countries[key]);
        const wmItem = worldometerData.find(item => item.country === key  || item.country === countries[key]);
        // now let's save the found values (if found, otherwise null)
        result[key].infected_Apify = adItem ? adItem.infected : null;
        result[key].infected_WM = wmItem ? wmItem.totalCases : null;
        result[key].deceased_Apify = adItem ? adItem.deceased : null;
        result[key].deceased_WM = wmItem ? wmItem.totalDeaths : null;
        result[key].recovered_Apify = adItem ? adItem.recovered : null;
        result[key].recovered_WM = wmItem ? wmItem.totalRecovered : null;
        result[key].tested_Apify = adItem ? adItem.tested : null;
        result[key].tested_WM = wmItem ? wmItem.totalTests : null;
    }

    const resultWithoutZeroDeviation = {};
    const resultWithHighDeviation = {};
    // const resultForWorldometer = {};
    // let's iterate through each key and save the deviation if entry was present in both files
    for (const key of Object.keys(result)) {
        let deviation = false;
        let highDeviation = false;

        if (result[key].infected_WM && result[key].infected_Apify) {
            // that's just a rough calculation - difference vs one of the values
            result[key].deviation_percent_infected = ((result[key].infected_WM - result[key].infected_Apify) / result[key].infected_Apify * 100).toFixed(2);
        } else {
            // or just save null
            result[key].deviation_percent_infected = null;
        }
        if (result[key].deceased_WM && result[key].deceased_Apify) {
            // that's just a rough calculation - difference vs one of the values
            result[key].deviation_percent_deceased = ((result[key].deceased_WM - result[key].deceased_Apify) / result[key].deceased_Apify * 100).toFixed(2);
        } else {
            // or just save null
            result[key].deviation_percent_deceased = null;
        }
        if (result[key].recovered_WM && result[key].recovered_Apify) {
            // that's just a rough calculation - difference vs one of the values
            result[key].deviation_percent_recovered = ((result[key].recovered_WM - result[key].recovered_Apify) / result[key].recovered_Apify * 100).toFixed(2);
        } else {
            // or just save null
            result[key].deviation_percent_recovered = null;
        }
        if (result[key].tested_WM && result[key].tested_Apify) {
            // that's just a rough calculation - difference vs one of the values
            result[key].deviation_percent_tested = ((result[key].tested_WM - result[key].tested_Apify) / result[key].tested_Apify * 100).toFixed(2);
        } else {
            // or just save null
            result[key].deviation_percent_tested = null;
        }
        
        // mark if the deviation_percent is different than 0 for at least one of the keys/values
        if ((result[key].deviation_percent_infected && (Math.abs(result[key].deviation_percent_infected) > 0 || Math.abs(result[key].deviation_percent_infected) < 0)) 
            || (result[key].deviation_percent_deceased && (Math.abs(result[key].deviation_percent_deceased) > 0 || Math.abs(result[key].deviation_percent_deceased) < 0)) 
            || (result[key].deviation_percent_recovered && (Math.abs(result[key].deviation_percent_recovered) > 0 || Math.abs(result[key].deviation_percent_recovered) < 0))  
            || (result[key].deviation_percent_tested && (Math.abs(result[key].deviation_percent_tested) > 0 || Math.abs(result[key].deviation_percent_tested) < 0)) ) {
                deviation = true;
            } 

        // mark if the deviation_percent is over 5% for at least one of the keys/values
        if ((result[key].deviation_percent_infected && Math.abs(result[key].deviation_percent_infected) >= 5)
            || (result[key].deviation_percent_deceased && Math.abs(result[key].deviation_percent_deceased) >= 5)
            || (result[key].deviation_percent_recovered && Math.abs(result[key].deviation_percent_recovered) >= 5) 
            || (result[key].deviation_percent_tested && Math.abs(result[key].deviation_percent_tested) >= 5)) {
                highDeviation = true;
            } 


        // save Object with all countries which are different at all or null
        // if ((result[key].deviation_percent && result[key].deviation_percent > 0) || (result[key].deviation_percent && result[key].deviation_percent < 0) || (result[key].deviation_percent === null)) { resultWithoutZeroDeviation[key] = result[key] }
        if (deviation) { resultWithoutZeroDeviation[key] = result[key] }

        // save Object with all countries which are different by more then 5%
        // if ((result[key].deviation_percent && Math.abs(result[key].deviation_percent) >= 5) || (result[key].deviation_percent === null)) { resultWithHighDeviation[key] = result[key] };
        if (highDeviation) { resultWithHighDeviation[key] = result[key] };

    }
    // if (highDeviation) {
        // Then we save report to KVS        
    await Apify.setValue('ALL_DEVIATIONS', resultWithoutZeroDeviation);
    // await Apify.setValue('APIFY_MORE_THEN_WM', resultForWorldometer);
        // Or create a dataset
    await Apify.pushData(resultWithHighDeviation);
});
