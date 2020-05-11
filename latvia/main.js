const Apify = require('apify');

const LATEST = 'LATEST';
const now = new Date();
const { log } = Apify.utils;

async function waitForContentToLoad(page) {
    const query = 'document.querySelector(\'full-container\').innerText.includes';

    return page.waitForFunction(
        `!!document.querySelector('full-container full-container')
        && ${query}('Veikto analīžu skaits') && ${query}('Saslimušo skaits')
        && ${query}('Mirušo skaits') && ${query}('Informācija atjaunota')`
        , { timeout: 45 * 1000 });
}

Apify.main(async () => {
    const url = 'https://spkc.maps.arcgis.com/apps/opsdashboard/index.html#/4469c1fb01ed43cea6f20743ee7d5939';

    const kvStore = await Apify.openKeyValueStore('COVID-19-LATVIA');
    const dataset = await Apify.openDataset('COVID-19-LATVIA-HISTORY');

    const requestList = new Apify.RequestList({ sources: [{ url }] });
    await requestList.initialize();

    let criticalErrors = 0;

    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        useApifyProxy: true,
        puppeteerPoolOptions: {
            retireInstanceAfterRequestCount: 1,
        },
        handlePageTimeoutSecs: 90,
        launchPuppeteerFunction: () => {
            const options = { useApifyProxy: true, useChrome: true };
            return Apify.launchPuppeteer(options);
        },
        gotoFunction: async ({ page, request }) => {
            await Apify.utils.puppeteer.blockRequests(page, {
                urlPatterns: ['.jpg', '.jpeg', '.png', '.svg', '.gif', '.woff', '.pdf', '.zip', '.pbf', '.woff2', '.woff'],
            });
            return page.goto(request.url, { timeout: 1000 * 30 });
        },
        handlePageFunction: async ({ page, request }) => {
            log.info(`Handling ${request.url} `);

            await Apify.utils.puppeteer.injectJQuery(page);
            log.info('Waiting for content to load');
            await waitForContentToLoad(page);
            log.info('Content loaded');


            const extracted = await page.evaluate(async () => {

                const toNumber = (str) => parseInt(str.replace(/\D/g, ""));

                const infected = toNumber($('div:contains(Saslimušo skaits)').last().text());
                const tested = toNumber($('div:contains(Veikto analīžu skaits)').last().text());
                const deceased = toNumber($('div:contains(Mirušo skaits)').last().text());

                const date = $('div:contains(Informācija)').last().text();

                return {
                    date, infected, tested, recovered: "N/A", deceased
                };
            });

            let sourceDate = new Date(formatDate(extracted.date));
            delete extracted.date;

            // ADD: infected, tested, recovered: "N/A", deceased
            const data = {
                ...extracted,
            };

            // ADD: lastUpdatedAtApify, lastUpdatedAtSource
            data.country = 'Latvia';
            // data.historyData = '';
            data.sourceUrl = 'https://arkartassituacija.gov.lv/';
            data.lastUpdatedAtApify = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString();
            data.lastUpdatedAtSource = new Date(Date.UTC(sourceDate.getFullYear(), sourceDate.getMonth(), sourceDate.getDate(), sourceDate.getHours(), sourceDate.getMinutes())).toISOString();
            // data.readMe = '';

            // Push the data
            let latest = await kvStore.getValue(LATEST);
            if (!latest) {
                await kvStore.setValue('LATEST', data);
                latest = Object.assign({}, data);
            }
            delete latest.lastUpdatedAtApify;
            const actual = Object.assign({}, data);
            delete actual.lastUpdatedAtApify;

            const { itemCount } = await dataset.getInfo();
            if (JSON.stringify(latest) !== JSON.stringify(actual) || itemCount === 0) {
                await dataset.pushData(data);
            }

            await kvStore.setValue('LATEST', data);
            await Apify.pushData(data);

            log.info('Data saved.');
        },
        handleFailedRequestFunction: ({ requst, error }) => {
            criticalErrors++;
        },
    });
    await crawler.run();
    if (criticalErrors > 0) {
        throw new Error('Some essential requests failed completely!');
    }
    log.info('Done.');
});
function formatDate(str) {
    [d, m, y] = str.match(/\d{1,2}.\d{1,2}.\d{4}/)[0].split('.');
    const h = str.match(/(?<=plkst.*)\d{1,2}.\d{2}/g)[0].replace('.', ':');
    return `${m}/${d}/${y} ${h}`;
}