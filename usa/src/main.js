const Apify = require('apify');

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
    let casesByStateJson = '';
    let json = '';
    page.on('response', async (res) => {
        if (res.url() === 'https://www.cdc.gov/coronavirus/2019-ncov/json/us-cases-map-data.json') {
            casesByStateJson = await res.text();
        } else if (res.url() === 'https://www.cdc.gov/coronavirus/2019-ncov/json/cumm-total-chart-data.json') {
            json = await res.json();
        }
    });
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    const extracted = await page.evaluate(() => {
        const totalCases = $('body > div.container.d-flex.flex-wrap.body-wrapper.bg-white > main > div:nth-child(3) > div > div:nth-child(4) > div:nth-child(1) > div > div > div > section > div > div > div:nth-child(1) > span.count').text().replace(',', '').trim();
        const totalDeaths = $('body > div.container.d-flex.flex-wrap.body-wrapper.bg-white > main > div:nth-child(3) > div > div:nth-child(4) > div:nth-child(1) > div > div > div > section > div > div > div:nth-child(2) > span.count').text().replace(',', '').trim();
        let dateUpdated = new Date();
        dateUpdated = new Date(Date.UTC(dateUpdated.getFullYear(), dateUpdated.getMonth(), dateUpdated.getDate())).toISOString();

        return { totalDeaths, totalCases, dateUpdated };
    });

    // const [dates, values] = json;
    // dates.splice(0, 1);
    // values.splice(0, 1);
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
        // casesByDays: dates.map((value, index) => {
        //     const dataSplit = value.split('/');
        //     return { date: new Date(Date.UTC(dataSplit[2], dataSplit[0], dataSplit[1])).toISOString(), value: values[index] };
        // }),
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
