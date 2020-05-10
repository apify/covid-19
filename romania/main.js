const Apify = require('apify');
const httpRequest = require('@apify/http-request');
const moment = require('moment');

const { utils: { log } } = Apify;

Apify.main(async () => {
    log.info('Opening Storage');
    const kvStore = await Apify.openKeyValueStore("COVID-19-ROMANIA");
    const dataset = await Apify.openDataset("COVID-19-ROMANIA-HISTORY");

    log.info('Getting latest data');

    const { body: {
        infected,
        tested,
        recovered,
        deceased,
        country,
        historyData,
        sourceUrl,
        lastUpdatedAtSource,
    } } = await httpRequest({ url: 'https://www.graphs.ro/json_apify.php', json: true });

    const lastUpdatedAtApify = moment().utc().second(0).millisecond(0).toISOString()

    log.info('Data received');

    const data = {
        infected,
        tested,
        recovered,
        deceased,
        country,
        historyData,
        sourceUrl,
        lastUpdatedAtSource,
        lastUpdatedAtApify,
        README: 'https://apify.com/vanadragos/covid-19-romania',
    };

    const latest = await kvStore.getValue('LATEST') || {};
    if (infected !== latest.infected
        || tested !== latest.tested
        || deceased !== latest.deceased
        || recovered !== latest.recovered
        || lastUpdatedAtSource !== latest.lastUpdatedAtSource) {
            log.info('New data received. Saving new to dataset');
            await dataset.pushData(data);
        }    

    log.info('Saving LATEST to Key-Value Store');
    await kvStore.setValue('LATEST', data);
});