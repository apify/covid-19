const Apify = require('apify');

const LATEST = 'LATEST';
const now = new Date();
const { log } = Apify.utils;

async function waitForContentToLoad(page) {
    const query = 'document.querySelectorAll(\'full-container full-container\')';

    return page.waitForFunction(`!!document.querySelector('#appInfo div') || (!!${query}[0] && !!${query}[2] && !!${query}[3] && !!${query}[10] && !!${query}[11] && !!${query}[12]`
        + ` && !!${query}[0].innerText.includes('الحالات المؤكدة')`
        + ` && !!${query}[2].innerText.includes('Mise à jour')`
        + ` && !!${query}[3].innerHTML.includes('<nav class="feature-list">')`
        + ` && !!${query}[10].innerText.includes('حالة شفاء')`
        + ` && !!${query}[11].innerText.includes('تحت العلاج')`
        + ` && !!${query}[12].innerText.includes('حالة وفاة'))`, { timeout: 45 * 1000 });
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
            // if (Apify.isAtHome()) {
            //     options.headless = true;
            //     options.stealth = true;
            // }
            return Apify.launchPuppeteer(options);
        },
        gotoFunction: async ({ page, request }) => {
            await Apify.utils.puppeteer.blockRequests(page, {
                urlPatterns: ['.jpg', '.jpeg', '.png', '.svg', '.gif', '.woff', '.pdf', '.zip', '.pbf', '.woff2', '.woff'],
            });
            return page.goto(request.url, { timeout: 1000 * 30 });
        },
        handlePageFunction: async ({ page, request }) => {
            log.info(`Handling ${request.url}`);

            await Apify.utils.puppeteer.injectJQuery(page);
            log.info('Waiting for content to load');
            await waitForContentToLoad(page);
            log.info('Content loaded');

            const extracted = await page.evaluate(async () => {

                if ($('#appInfo').innerText) return;

                async function strToInt(str) {
                    return parseInt(str.replace(/( |,)/g, ''), 10);
                }

                const fullContainer = $('full-container full-container').toArray();

                const date = $(fullContainer[2]).text().match(/(\d|\/)+/g)[0];

                const hospitalized = await strToInt($(fullContainer[11]).text().match(/(\d|,)+/g)[0]);
                const infected = await strToInt($(fullContainer[0]).text().match(/(\d|,)+/g)[0]);
                const recovered = await strToInt($(fullContainer[10]).text().match(/(\d|,)+/g)[0]);
                const deceased = await strToInt($(fullContainer[12]).text().match(/(\d|,)+/g)[0]);

                const spans = $(fullContainer[3]).find('nav.feature-list span[id*="ember"]').toArray();

                const infectedByRegion = [];

                for (const span of spans) {
                    const ps = $(span).find('p').toArray();
                    const oldCases = ps[0].textContent.match(/(\d,*)+/g);
                    const newCases = ps[1].textContent.match(/(\d,*)+/g);
                    infectedByRegion.push({
                        value: oldCases ? parseInt(oldCases[0].replace(/,/g, '')) : 0,
                        region: ps[0].textContent.match(/([a-z '-]+)/gi).filter(el => el.trim() !== '')[0].replace(/-/g, ' ').trim(),
                        newly: newCases ? parseInt(newCases[0].replace(/,/g, '')) : 0
                    })
                }

                return {
                    date, infected, hospitalized, recovered, deceased, infectedByRegion,
                };
            });
            if (!extracted) {
                log.info('Unavailable source data, maybe Update or maintenance purpose.')
                return;
            }

            let sourceDate = new Date(await formatDate(extracted.date));
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

async function formatDate(date) {
    [a, b, c] = date.split('/');
    return `${b}/${a}/${c}`;
}
