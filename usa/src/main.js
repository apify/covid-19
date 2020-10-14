const Apify = require('apify');
const httpRequest = require("@apify/http-request");

const LATEST = 'LATEST';
const parseNum = (str) => {
    return parseInt(str.replace(',', ''), 10);
};
Apify.main(async () => {
    const url = 'https://www.cdc.gov/coronavirus/2019-ncov/cases-in-us.html';
    const kvStore = await Apify.openKeyValueStore('COVID-19-USA-CDC');
    const dataset = await Apify.openDataset('COVID-19-USA-CDC-HISTORY');

    const browser = await Apify.launchPuppeteer({ useApifyProxy: true, apifyProxyGroups: ['SHADER'] });
    const page = await browser.newPage();
    await Apify.utils.puppeteer.injectJQuery(page);
    let {body: casesByStateJson} = await httpRequest({
        url: 'https://www.cdc.gov/coronavirus/2019-ncov/json/us-cases-map-data.json',
        proxyUrl: Apify.getApifyProxyUrl({groups: ["SHADER"]}),
        json: false,
        headers: {
            Accept: 'application/json, */*',
            'Content-Type': 'application/json',
        }
    })
    casesByStateJson = casesByStateJson.replace("﻿[", "[")

    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    const extracted = await page.evaluate(() => {
        const totalCases = $('#viz001_uscases .card-number').text().replace(/\D/g, "").trim();
        const totalDeaths = $('#viz002_usdeaths .card-number').text().replace(/\D/g, '').trim();
        let dateUpdated = new Date();
        dateUpdated = new Date(Date.UTC(dateUpdated.getFullYear(), dateUpdated.getMonth(), dateUpdated.getDate())).toISOString();

        return { totalDeaths, totalCases, dateUpdated };
    });

    const now = new Date();
    const data = {
        totalCases: parseNum(extracted.totalCases),
        totalDeaths: parseNum(extracted.totalDeaths),
        casesByState: JSON.parse(casesByStateJson).map(row => ({
            name: row.Jurisdiction,
            range: row.Range,
            casesReported: row['Cases Reported'],
            communityTransmission: row['Community Transmission'],
        })),
        sourceUrl: url,
        lastUpdatedAtSource: extracted.dateUpdated,
        lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
        readMe: 'https://apify.com/petrpatek/covid-usa-cdc',
    };

    console.log(data)

    let latest = await kvStore.getValue(LATEST);
    if (!latest) {
        await kvStore.setValue('LATEST', data);
        latest = data;
    }
    delete latest.lastUpdatedAtApify;
    const actual = Object.assign({}, data);
    delete actual.lastUpdatedAtApify;

    if (JSON.stringify(latest) !== JSON.stringify(actual)) {
        await dataset.pushData(data);
    }

    await kvStore.setValue('LATEST', data);
    await Apify.pushData(data);


    console.log('Closing Puppeteer...');
    await browser.close();
    console.log('Done.');
});
