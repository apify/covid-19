const Apify = require('apify');
const httpRequest = require('@apify/http-request')
const cheerio = require('cheerio');
const sourceUrl = 'https://coronavirus.bg/bg/';
const LATEST = 'LATEST';

Apify.main(async () => {
    const kvStore = await Apify.openKeyValueStore('COVID-19-BG');
    const dataset = await Apify.openDataset('COVID-19-BG-HISTORY');

    console.log('Getting data...');
    const { body } = await httpRequest({ url: sourceUrl });
    const $ = cheerio.load(body);
    const tested = $('body > main > div.container-fluid.main-content-top > div > div.row.statistics-container > div.col-lg-3.col-md-6 > p.statistics-value').text();
    const infected = $('body > main > div.container-fluid.main-content-top > div > div.row.statistics-container > div:nth-child(2) > p.statistics-value.confirmed').text();
    const activeCases = $('body > main > div.container-fluid.main-content-top > div > div.row.statistics-container > div:nth-child(2) > p.statistics-subvalue').text();
    const hospitalised = $('body > main > div.container-fluid.main-content-top > div > div.row.statistics-container > div:nth-child(3) > p.statistics-value').text();
    const ICU = $('body > main > div.container-fluid.main-content-top > div > div.row.statistics-container > div:nth-child(3) > p.statistics-subvalue').text();
    const recovered = $('body > main > div.container-fluid.main-content-top > div > div.row.statistics-container > div:nth-child(4) > p.statistics-value.healed').text();
    const deceased = $('body > main > div.container-fluid.main-content-top > div > div.row.statistics-container > div:nth-child(5) > p.statistics-value.deceased').text();

    const now = new Date();

    const result = {
        tested,
        infected,
        activeCases,
        hospitalised, 
        ICU, 
        recovered,
        deceased,
        sourceUrl: 'https://coronavirus.bg/bg/',
        lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
        readMe: 'https://apify.com/zuzka/covid-bg'
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