const Apify = require('apify');
const httpRequest = require('@apify/http-request')
const cheerio = require('cheerio');
const sourceUrl = 'https://koronastop.lrv.lt/en/';
const LATEST = 'LATEST';
var moment = require('moment');

Apify.main(async () => {
    const kvStore = await Apify.openKeyValueStore('COVID-19-LITHUANIA');
    const dataset = await Apify.openDataset('COVID-19-LITHUANIA-HISTORY');

    console.log('Getting data...');
    const { body } = await httpRequest({ url: sourceUrl });
    const $ = cheerio.load(body);
    const value = $('.value').toArray().map(v => $(v).text());

    const infected = Number(value[0]);
    const infectedDaily = Number(value[1]);
    const recovered = Number(value[2]);
    const deceasedDaily = Number(value[3]);
    const deceased = Number(value[4]);

    const rawDate = $('#w-statistics-in-lithuania h3').text().split(' ');
    let date = `${rawDate[1]} ${rawDate[0].substring(0,3)} 2021 ${rawDate[2]} UT`

    const lastUpdatedAtSource = moment(date).format();
    const lastUpdatedAtApify = moment().format();
    
    const result = {
        infected,
        infectedDaily,
        recovered,
        deceasedDaily,
        deceased,
        lastUpdatedAtSource, 
        lastUpdatedAtApify,
        readMe: 'https://apify.com/dtrungtin/covid-lt',
        historyData: 'https://api.apify.com/v2/datasets/1XdITM6u7PbhUrlmK/items?format=json&clean=1',
        country: 'LITHUANIA',
        sourceUrl, 
        latestData: 'https://api.apify.com/v2/key-value-stores/xhGDb8VTqjtm1AQL6/records/LATEST?disableRedirect=true'
    };
    console.log(result)

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
}
);
