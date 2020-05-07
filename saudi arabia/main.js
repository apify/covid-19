const Apify = require('apify');

const LATEST = 'LATEST';
const now = new Date();
const { log } = Apify.utils;
const sourceUrl = 'https://covid19.moh.gov.sa/'

async function waitForContentToLoad(page) {
    const query = 'document.querySelector(\'full-container\').innerText.includes';

    return page.waitForFunction(
        `!!document.querySelector('full-container full-container')
        && ${query}('إجمالي الحالات') && ${query}('الحالات النشطة') && ${query}('إجمالي المتعافين')
        && ${query}('إجمالي الفحوصات')`
        , { timeout: 45 * 1000 });
}

Apify.main(async () => {
    const url = 'https://esriksa-emapstc.maps.arcgis.com/apps/opsdashboard/index.html#/6cd8cdcc73ab43939709e12c19b64a19';

    const kvStore = await Apify.openKeyValueStore('COVID-19-SA');
    const dataset = await Apify.openDataset('COVID-19-SA-HISTORY');
    const { email } = await Apify.getValue('INPUT');

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

                function strToInt(str) {
                    return parseInt(str.replace(/( |,)/g, ''), 10);
                }

                const infected = strToInt($('text:contains("إجمالي الحالات")').parents('div[id*=ember]').eq(0).next().text().trim());
                const recovered = strToInt($('text:contains("إجمالي المتعافين")').parents('div[id*=ember]').eq(0).next().text().trim());
                const tested = strToInt($('text:contains("إجمالي الفحوصات")').parents('div[id*=ember]').eq(0).next().text().trim());
                const deceased = strToInt($('text:contains("الوفيات")').parents('div[id*=ember]').eq(0).next().text().trim());
                const active = strToInt($('text:contains("الحالات النشطة")').parents('div[id*=ember]').eq(0).next().text().trim());

                return {
                    infected, tested, recovered, deceased, active,
                };
            });

            // ADD:  infected, recovered, tested, deceased, active
            const data = {
                ...extracted,
            };

            data.country = 'Saudi Arabia';
            data.historyData = 'https://api.apify.com/v2/datasets/OeaEEGdhvUSkXRrWU/items?format=json&clean=1'
            data.sourceUrl = sourceUrl;
            data.lastUpdatedAtApify = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString();
            data.lastUpdatedAtSource = 'N/A';
            data.readMe = 'https://apify.com/katerinahronik/covid-sa';

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
