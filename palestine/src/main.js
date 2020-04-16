const Apify = require('apify');

const LATEST = 'LATEST';
const now = new Date();
const { log } = Apify.utils;

async function waitForContentToLoad(page) {
    const query = 'document.querySelectorAll(\'full-container full-container\')';

    return page.waitForFunction(`!!${query}[0] && !!${query}[1] && !!${query}[2] && !!${query}[5] && !!${query}[7] && !!${query}[6]`
        + ` && !!${query}[0].innerText.includes('الاصابات المؤكدة التراكمية')`
        + ` && !!${query}[1].innerText.includes('الشفاء التام')`
        + ` && !!${query}[2].innerText.includes('الحالات المؤكدة حسب')`
        + ` && !!${query}[5].innerText.includes('الحجر المنزلي')`
        + ` && !!${query}[7].innerText.includes('عدد الوفيات')`
        + ` && !!${query}[6].innerText.includes('Last update')`, { timeout: 45 * 1000 });
}

Apify.main(async () => {
    const url = 'https://portal.geomolg.ps/portal/apps/opsdashboard/index.html#/63d63a6d45f44621b361d8a53c235d46';

    const kvStore = await Apify.openKeyValueStore('COVID-19-PALESTINE');
    const dataset = await Apify.openDataset('COVID-19-PALESTINE-HISTORY');

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
                async function strToInt(str) {
                    return parseInt(str.replace(/( |,)/g, ''))
                }

                const fullContainer = $('full-container full-container').toArray();

                const date = $(fullContainer[6]).find('i').text().trim();
                const infected = await strToInt($(fullContainer[0]).find('g').last().text().trim());
                const recovered = await strToInt($(fullContainer[1]).find('g').last().text().trim());
                const deceased = await strToInt($(fullContainer[7]).find('g').last().text().trim());
                const atHome = await strToInt($(fullContainer[5]).find('g').last().text().trim());

                const spans = $(fullContainer[2]).find('span[id*="ember"]').toArray();

                const infectedByRegion = [];
                spans.forEach(async (span) => {
                    const strongs = $(span).find('strong')
                    infectedByRegion.push({
                        value: await strToInt(strongs[0].innerText),
                        region: strongs[1].innerText.match(/([A-Z']+)/gi).join(' ').trim(),
                    })
                })

                return {
                    infected, recovered, deceased, atHome, infectedByRegion, date
                };
            });

            log.info('Processing and saving data.')
            // ADD: tested, infected, recovered, deceased, atHome, infectedByRegion

            // const sourceDate = new Date(getDateFromString(extracted.date));
            const sourceDate = await getDateFromString(extracted.date);
            delete extracted.date;

            const data = {
                tested: 'N/A',
                ...extracted
            }

            //ADD: historyData, country, sourceUrl, lastUpdatedAtSource, lastUpdatedAtApify, readMe
            data.country = 'Palestine';
            data.historyData = 'https://api.apify.com/v2/datasets/BKpHLQrJPmgXE51tf/items?format=json&clean=1';
            data.sourceUrl = 'http://site.moh.ps';
            data.lastUpdatedAtApify = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString();
            data.lastUpdatedAtSource = new Date(Date.UTC(sourceDate.getFullYear(), sourceDate.getMonth(), sourceDate.getDate(), sourceDate.getHours(), sourceDate.getMinutes())).toISOString();
            data.readMe = 'https://apify.com/onidivo/covid-ps';

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

async function getDateFromString(str) {
    const date = new Date(now);
    if (str.toLowerCase().includes('second')) {
        return date;
    }
    if (str.toLowerCase().includes('minute')) {
        const [numb = 1] = str.match(/\d+/g);
        return new Date(date.setMinutes(date.getMinutes() - parseInt(numb)))
    }
    return new Date(str.match(/[0-9]+/g).join('-'));
}












