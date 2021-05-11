const Apify = require('apify')

const LATEST = 'LATEST'
const now = new Date()
const { log } = Apify.utils

Apify.main(async () => {
    const url =
        'https://ls-osp-sdg.maps.arcgis.com/apps/opsdashboard/index.html#/0ad95e6d5dd24cbabe3f20434c1c6d27';

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
        handlePageTimeoutSecs: 120,
        launchPuppeteerFunction: () => {
            const options = {
                useApifyProxy: true,
                useChrome: true
            }
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

            log.info('Waiting for content to load');
            await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 1000 * 90 });
            await Apify.utils.puppeteer.injectJQuery(page);
            log.info('Content loaded');

            log.info('Extracting and processing data...');
            const data = await page.evaluate(async () => {
                const toNumber = (str) => parseInt(str.replace(/\D+/g, ''));
                const toString = (str) => str.replace(/\d+|:+|,+/g, '').trim();

                return {
                    active: toNumber($('full-container:contains(Šiuo metu serga)')
                        .last()
                        .find('text:contains(statistiškai)')
                        .text()),
                    recovered: toNumber($('full-container:contains(Pasveiko)')
                        .eq(1)
                        .find('text:contains(statistiškai)')
                        .text()),
                    deceased: toNumber($('full-container:contains(Ligos atvejai)')
                        .last()
                        .text()),
                    newCases: toNumber($('full-container:contains(Paros nauji atvejai)')
                        .last().find('text').first().text()),
                    infectedByRegion: $('.feature-list').first().find('div.external-html').toArray().map(div => {
                        const text = $(div).find('p').text();
                        return {
                            region: toString(text),
                            newCases: toNumber(text),
                        }
                    }),
                    reportingDay: $('full-container:contains(Ataskaitinė para)').last().find('strong').text().trim()
                }
            });

            const sourceDate = new Date(data.reportingDay);
            delete data.reportingDay;

            data.country = 'LITHUANIA';
            data.historyData = 'https://api.apify.com/v2/datasets/1XdITM6u7PbhUrlmK/items?format=json&clean=1';
            data.sourceUrl = 'https://osp.maps.arcgis.com/apps/MapSeries/index.html?appid=79255eaa219140dfa65c01ae95ed143b';
            data.lastUpdatedAtApify = new Date(
                Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())
            ).toISOString();


            data.lastUpdatedAtSource = new Date(
                Date.UTC(sourceDate.getFullYear(), sourceDate.getMonth(), sourceDate.getDate(), sourceDate.getHours(), sourceDate.getMinutes())
            ).toISOString();

            data.readMe = 'https://apify.com/dtrungtin/covid-lt'

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
        handleFailedRequestFunction: async ({ requst, error }) => {
            log.error(error);
            await Apify.pushData({
                '#request': requst,
                '#error': error
            });
            criticalErrors++
        }
    })
    await crawler.run()
    if (criticalErrors > 0) {
        throw new Error('Some essential requests failed completely!')
    }
    log.info('Done.')
});