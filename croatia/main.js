const Apify = require('apify');
const httpRequest = require('@apify/http-request')
const cheerio = require('cheerio');
const sourceUrl = 'https://www.koronavirus.hr/en';
const LATEST = 'LATEST';
let decodeHtml = require("decode-html");

Apify.main(async () => {
    const kvStore = await Apify.openKeyValueStore('COVID-19-HR');
    const dataset = await Apify.openDataset('COVID-19-HR-HISTORY');

    console.log('Getting data...');
    const { body } = await httpRequest({ url: sourceUrl });
    const $ = cheerio.load(body);
    const infected = $('h2:contains(Cases)').next().text().replace('.','');
    const recovered = $('h2:contains(Cured)').next().text().replace('.','');
    const deceased = $('h2:contains(Deceased)').next().text().replace('.','');

    const toBeDate = $('.counter-updated').text().split(' ');
    const year = "2012";
    const month = toBeDate[1];
    const day = toBeDate[2];
    const time = toBeDate[4];
    
    // const daily = JSON.parse(decodeHtml($('#canvas2').attr('data-barchart')));

    const now = new Date();

    const result = {
        infected: Number(infected),
        recovered: Number(recovered),
        deceased: Number(deceased),
        lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
        readMe: 'https://apify.com/zuzka/covid-hr',
        // daily
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
