const Apify = require('apify');

const LATEST = 'LATEST';
const now = new Date();
const { log } = Apify.utils;

async function waitForContentToLoad(page) {
    const query = 'document.querySelector(\'full-container\').innerText.includes';

    return page.waitForFunction(
        `!!document.title.includes('Sign In') || (!!document.querySelector('full-container full-container')
        && ${query}('الحالات المؤكدة') && ${query}('حالة شفاء') && ${query}('تحت العناية المركزة') && ${query}('حالة وفاة')
        && !!document.querySelectorAll('nav.feature-list')[1])`
        , { timeout: 45 * 1000 });
}

Apify.main(async () => {
    const url = 'https://msprh-dz.maps.arcgis.com/apps/opsdashboard/index.html#/eb524fcb95374f2cb60352b426e6e340';

    const kvStore = await Apify.openKeyValueStore('COVID-19-ALGERIA');
    const dataset = await Apify.openDataset('COVID-19-ALGERIA-HISTORY');

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
            return page.goto(request.url, { timeout: 1000 * 60 });
        },
        handlePageFunction: async ({ page, request }) => {
            log.info(`Handling ${request.url} `);

            await Apify.utils.puppeteer.injectJQuery(page);
            log.info('Waiting for content to load');
            await waitForContentToLoad(page);
            log.info('Content loaded');


            const extracted = await page.evaluate(async () => {

                if (document.title === 'Sign In') return;

                function strToInt(str) {
                    return parseInt(str.replace(/( |,)/g, ''), 10);
                }
                const text = $('full-container full-container').text().replace(/(\n|\r)/g, '').trim()

                const date = $('div:contains(اخر تحديث)').last().text()
                    .match(/[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4}.*[0-9]{1,2}:[0-9]{1,2}/)[0];

                const hospitalized = strToInt($('div:contains(تحت العناية المركزة)').last().parent().text().match(/[\d,]+/g)[0]);
                const infected = strToInt(text.match(/(?<=الحالات(\s+)المؤكدة\s*)[\d,]+/g)[0]);
                const recovered = strToInt($('div:contains(حالة شفاء)').last().parent().text().match(/[\d,]+/g)[0]);
                const deceased = strToInt($('div:contains(حالة وفاة)').last().parent().text().match(/[\d,]+/g)[0]);

                const spans = $($('nav.feature-list')[1]).find('span[class*="ember"]').toArray();

                const infectedByRegion = [];

                for (const span of spans) {
                    const innerText = $(span).text();
                    const numbers = innerText.match(/(\d,*)+/g);
                    infectedByRegion.push({
                        value: parseInt(numbers[0].replace(/,/g, '')) || 0,
                        region: innerText.match(/([a-z ']+)/gi).join(' ').trim(),
                        // newly: numbers[1] ? parseInt(numbers[1].replace(/,/g, '')) : 0
                    })
                }

                return {
                    date, infected, hospitalized, recovered, deceased, infectedByRegion,
                };
            });
            if (!extracted) {
                log.info('Unavailable source data, maybe for update or maintenance purpose.')
                return;
            }

            let sourceDate = new Date(formatDate(extracted.date));
            delete extracted.date;

            // ADD:  infected, hospitalized, recovered, deceased, infectedByRegion
            const data = {
                tested: 'N/A',
                ...extracted,
            };

            // ADD: infectedByRegion, lastUpdatedAtApify, lastUpdatedAtSource
            data.country = 'Algeria';
            data.historyData = 'https://api.apify.com/v2/datasets/hi0DJXpcyzDwtg2Fm/items?format=json&clean=1';
            data.sourceUrl = 'http://covid19.sante.gov.dz/carte';
            data.lastUpdatedAtApify = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString();
            data.lastUpdatedAtSource = new Date(Date.UTC(sourceDate.getFullYear(), sourceDate.getMonth(), sourceDate.getDate(), sourceDate.getHours(), sourceDate.getMinutes())).toISOString();
            data.readMe = 'https://apify.com/onidivo/covid-dz';

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

function formatDate(date) {
    [a, b, c] = date.split('/');
    return `${b} /${a}/${c} `.replace(/,/g, '');
}
