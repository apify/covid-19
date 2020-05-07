const Apify = require('apify');
const httpRequest = require('@apify/http-request')
const cheerio = require('cheerio');
const sourceUrl = 'https://corona.ps/details';
const LATEST = 'LATEST';

Apify.main(async () => {
    const kvStore = await Apify.openKeyValueStore('COVID-19-PS');
    const dataset = await Apify.openDataset('COVID-19-PS-HISTORY');

    console.log('Getting data...');
    const { body } = await httpRequest({ url: sourceUrl });
    const $ = cheerio.load(body);
    const infected = $('body > div.top-container > div > div.header-div > div.all-stats > div.stats-div1 > div > div.total_cases > div').text()
    const recovered = $('body > div.top-container > div > div.header-div > div.all-stats > div:nth-child(3) > div > div.stat-number-div > a > div').text()
    const deceased = $('body > div.top-container > div > div.header-div > div.all-stats > div:nth-child(2) > div > div.stat-number-div > a > div').text()

    const regionsTableRows = Array.from($("#Table2 > tbody > tr"));
    const regionData = [];
    for (const row of regionsTableRows) {
        const cells = Array.from($(row).find("td")).map(td => $(td).text());
        regionData.push({ region: cells[0], total: cells[1], lastDay: cells[2], inc14d: cells[3] });
    }
    const now = new Date();

    const result = {
        infected: infected,
        recovered: recovered,
        deceased: deceased,
        regions: regionData,
        sourceUrl: 'https://corona.ps/details',
        lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
        readMe: 'https://github.com/zpelechova/covid-ps/blob/master/README.md'
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
