const Apify = require('apify');
const httpRequest = require('@apify/http-request')
const cheerio = require('cheerio');
const sourceUrl = 'https://www.koronavirus.hr/en';
const LATEST = 'LATEST';

Apify.main(async () => {
    const kvStore = await Apify.openKeyValueStore('COVID-19-HR');
    const dataset = await Apify.openDataset('COVID-19-HR-HISTORY');

    console.log('Getting data...');
    const { body } = await httpRequest({ url: sourceUrl });
    const $ = cheerio.load(body);
    const infected = $('body > div:nth-child(3) > div > div > ul > li:nth-child(2) > strong:nth-child(2)').text().replace('.','');
    const recovered = $('body > div:nth-child(3) > div > div > ul > li:nth-child(3) > strong:nth-child(2)').text().replace('.','');
    const deceased = $('body > div:nth-child(3) > div > div > ul > li:nth-child(4) > strong:nth-child(2)').text();

    const now = new Date();

    const result = {
        infected: Number(infected),
        recovered: Number(recovered),
        deceased: Number(deceased),
        lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
        readMe: 'https://apify.com/zuzka/covid-hr'
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
