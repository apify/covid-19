const Apify = require('apify')

const LATEST = 'LATEST'
const now = new Date()
const { log } = Apify.utils

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
            log.info(`Handling ${request.url}`);

            await Apify.utils.puppeteer.injectJQuery(page);
            log.info('Waiting for content to load');

            const responses = await Promise.all([
                page.waitForResponse(request => request.url().match(/municipality_code.*asc/g)),
                page.waitForResponse(request => request.url().match(/confirmed_cases_in_14days_per_1.*desc/g))
            ]);

            const { features: allData } = await responses[0].json();
            const { features: regionsData } = await responses[1].json();

            log.info('Content loaded');

            const data = {
                active: allData[0].attributes.active_cases,
                infected: allData[0].attributes.confirmed_cases,
                recovered: allData[0].attributes.recovered_cases,
                deceased: allData[0].attributes.deaths,
                newCases: allData[0].attributes.new_cases_yesterday,
                infectedByRegion: regionsData.map(({ attributes }) => {
                    return {
                        region: attributes.municipality_name,
                        value: parseFloat(attributes.confirmed_cases_in_14days_per_1.toFixed(1)),
                        active: attributes.active_cases,
                        infected: attributes.confirmed_cases,
                        recovered: attributes.recovered_cases,
                        deceased: attributes.deaths,
                        newCases: attributes.new_cases_yesterday,
                    }
                }),
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