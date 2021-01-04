const Apify = require('apify')

const LATEST = 'LATEST'
const now = new Date()
const { log } = Apify.utils

async function waitForContentToLoad(page) {
    const query = "document.querySelectorAll('full-container full-container')"

    return page.waitForFunction(
        `!!${query}[5] && !!${query}[12] && !!${query}[13] && !!${query}[14] && !!${query}[15] && !!${query}[18]` +
        ` && !!${query}[5].innerText.match(/Nauji atvejai([\\n\\r]|.*)+[0-9,]+/g)` +
        ` && !!${query}[12].innerText.match(/Serga([\\n\\r]|.*)+[0-9,]+/g)` +
        ` && !!${query}[13].innerText.match(/Patvirtinti atvejai([\\n\\r]|.*)+[0-9,]+/g)` +
        ` && !!${query}[14].innerText.match(/Pasveiko([\\n\\r]|.*)+[0-9,]+/g)` +
        ` && !!${query}[15].innerText.match(/Mirė([\\n\\r]|.*)+[0-9,]+/g)` +
        ` && !!${query}[18].innerHTML.includes('<nav class="feature-list">')`,
        { timeout: 90 * 1000 }
    )
}

Apify.main(async () => {
    const url =
        'https://ls-osp-sdg.maps.arcgis.com/apps/opsdashboard/index.html#/3bea26e9f2364e8a86c446aca71ce973';

    const kvStore = await Apify.openKeyValueStore("COVID-19-LITHUANIA");
    const dataset = await Apify.openDataset("COVID-19-LITHUANIA-HISTORY");

    const requestList = new Apify.RequestList({ sources: [{ url }] });
    await requestList.initialize();
    const proxyConfiguration = await Apify.createProxyConfiguration();

    let criticalErrors = 0

    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        proxyConfiguration,
        puppeteerPoolOptions: {
            retireInstanceAfterRequestCount: 1
        },
        handlePageTimeoutSecs: 90,
        launchPuppeteerFunction: () => {
            const options = { useApifyProxy: true, useChrome: true }
            return Apify.launchPuppeteer(options)
        },
        gotoFunction: async ({ page, request }) => {
            await Apify.utils.puppeteer.blockRequests(page, {
                urlPatterns: [
                    ".jpg",
                    ".jpeg",
                    ".png",
                    ".svg",
                    ".gif",
                    ".woff",
                    ".pdf",
                    ".zip",
                    ".pbf",
                    ".woff2",
                    ".woff",
                ],
            });
            return page.goto(request.url, { timeout: 1000 * 60 });
        },
        handlePageFunction: async ({ page, request }) => {
            log.info(`Handling ${request.url}`)

            await Apify.utils.puppeteer.injectJQuery(page)
            log.info('Waiting for content to load')

            // await page.waitForNavigation({ timeout: 60 * 1000 });
            // waitUntil: 'domcontentloaded',
            await waitForContentToLoad(page);

            log.info('Content loaded')

            const extracted = await page.evaluate(async () => {
                // function strToInt(str) {
                //     return parseInt(str.replace(/( |,)/g, ''), 10)
                // }

                function strToInt(str) {
                    return parseInt(str.replace(/\D/g, ''))
                }

                const fullContainer = $('full-container full-container').toArray()

                const newCases = strToInt($(fullContainer[5]).find('text').last().text());
                const active = strToInt($(fullContainer[12]).find('text').last().text());
                const infected = strToInt($(fullContainer[13]).find('text').last().text());
                const recovered = strToInt($(fullContainer[14]).find('text').last().text());
                const deceased = strToInt($(fullContainer[15]).find('text').last().text());

                const infectedByRegion = $(fullContainer[18]).find('.external-html').toArray().map(item => {
                    return {
                        region: $(item).find('p').text().match(/[^.]+/g)[0],
                        value: parseFloat($(item).find('strong').text().replace(/,+/g, ''), 10)
                    }
                });

                return {
                    active,
                    infected,
                    recovered,
                    deceased,
                    newCases,
                    infectedByRegion
                }
            })
            // console.log(extracted);
            // ADD:  active, infected, recovered, deceased, newCases, infectedByRegion
            const data = {
                ...extracted
            }

            data.country = 'LITHUANIA';
            data.historyData = 'https://api.apify.com/v2/datasets/1XdITM6u7PbhUrlmK/items?format=json&clean=1';
            data.sourceUrl = 'https://osp.maps.arcgis.com/apps/MapSeries/index.html?appid=79255eaa219140dfa65c01ae95ed143b';
            data.lastUpdatedAtApify = new Date(
                Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())
            ).toISOString()

            data.readMe = 'https://apify.com/dtrungtin/covid-lt'

            console.log(data)

            // Push the data
            let latest = await kvStore.getValue(LATEST)
            if (!latest) {
                await kvStore.setValue('LATEST', data)
                latest = Object.assign({}, data)
            }
            delete latest.lastUpdatedAtApify
            const actual = Object.assign({}, data)
            delete actual.lastUpdatedAtApify

            const { itemCount } = await dataset.getInfo()
            if (
                JSON.stringify(latest) !== JSON.stringify(actual) ||
                itemCount === 0
            ) {
                await dataset.pushData(data)
            }

            await kvStore.setValue('LATEST', data)
            await Apify.pushData(data)

            log.info('Data saved.')
        },
        handleFailedRequestFunction: ({ requst, error }) => {
            criticalErrors++
        }
    })
    await crawler.run()
    if (criticalErrors > 0) {
        throw new Error('Some essential requests failed completely!')
    }
    log.info('Done.')
});