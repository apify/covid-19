const Apify = require('apify');
const httpRequest = require('@apify/http-request')
const cheerio = require('cheerio');
const sourceUrl = 'http://www.salud.gob.hn/site/';
const LATEST = 'LATEST';

Apify.main(async () => {
    const kvStore = await Apify.openKeyValueStore('COVID-19-HN');
    const dataset = await Apify.openDataset('COVID-19-HN-HISTORY');

    console.log('Getting data...');
    const { body } = await httpRequest({ url: sourceUrl });
    const $ = cheerio.load(body);
    const infected = $('#art-main > div > div.art-layout-wrapper > div > div > div.art-layout-cell.art-content > div:nth-child(4) > div > div > section > div > div > div:nth-child(2) > div:nth-child(1) > div.skillbar-score > span.score').text()


const toInt = (string) => Number(string.replace('.', ''))

    const now = new Date();

    const result = {
        infected
    //     : toInt(infected),
    //   sourceUrl: 'http://publichealth.lacounty.gov/media/Coronavirus/',
    //     lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
    //     readMe: 'https://apify.com/jakubbalada/coronavirus-la'
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
