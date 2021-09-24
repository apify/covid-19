const Apify = require('apify');
const moment = require('moment');

const { log } = Apify.utils
const LATEST = 'LATEST'
const now = new Date()

const sourceUrl = 'https://www.gov.pl/web/koronawirus/wykaz-zarazen-koronawirusem-sars-cov-2';
const detailsDataUrl = 'https://rcb-gis.maps.arcgis.com/apps/opsdashboard/index.html#/e496f00bd8b947099ff95d9e26418a2c'
const regionDataUrl = 'https://rcb-gis.maps.arcgis.com/apps/opsdashboard/index.html#/a0dd36f27d8c4fd895f4c1c78a6757f0'

Apify.main(async () => {

    const kvStore = await Apify.openKeyValueStore('COVID-19-POLAND');
    const dataset = await Apify.openDataset('COVID-19-POLAND-HISTORY');

    const requestList = new Apify.RequestList({ sources: [{ url: detailsDataUrl }] })
    await requestList.initialize()

    let criticalErrors = 0

    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        useApifyProxy: true,
        // apifyProxyGroups: ['CZECH_LUMINATI'],
        puppeteerPoolOptions: {
            retireInstanceAfterRequestCount: 1
        },
        handlePageTimeoutSecs: 270,
        launchPuppeteerFunction: () => {
            const options = {
                useApifyProxy: true,
                // useChrome: true
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
            return page.goto(request.url, { timeout: 1000 * 120 });
        },
        handlePageFunction: async ({ page, request }) => {
            log.info(`Handling ${request.url}`)

            log.info('Waiting for all data to load...')
            await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 1000 * 90 });
            await Apify.utils.puppeteer.injectJQuery(page);
            log.info('Content loaded, Processing data...');
            log.info('Extracting and processing data...');

            const allData = await page.evaluate(async () => {
                const toNumber = (str) => parseInt(str.replace(/\D+/g, ''));
                const toString = (str) => str.replace(/\d+|:+|,+/g, '').trim();

                return {
                    infected: toNumber($('div.external-html:contains(osoby zakażone)').eq(0).find('p').last().text()),
                    deceased: toNumber($('div.external-html:contains(przypadki śmiertelne)').eq(0).find('p').last().text()),
                    recovered: toNumber($('div.external-html:contains(osoby, które wyzdrowiały)').eq(0).find('p').last().text()),
                    // activeCase: toNumber(),
                    dailyInfected: toNumber($('div.external-html:contains(osoby zakażone)').eq(1).find('p').last().text()),
                    dailyTested: toNumber($('div.external-html:contains(wykonane testy:)').find('p').last().text()),
                    dailyPositiveTests: toNumber($('div.external-html:contains(testy z wynikiem pozytywnym)').find('p').last().text()),
                    dailyDeceased: toNumber($('div.external-html:contains(przypadki śmiertelne)').eq(1).find('p').last().text()),
                    // dailyDeceasedDueToCovid: allData.ZGONY_COVID || "",
                    dailyRecovered: toNumber($('div.external-html:contains(osoby, które wyzdrowiały)').eq(1).find('p').last().text()),
                    dailyQuarantine: toNumber($('div.external-html:contains(osoby na kwarantannie)').find('p').last().text()),
                    txtDate: $('div.external-html:contains(Dane pochodzą z Ministerstwa Zdrowia z dnia )').find('strong').text(),
                }
            });

            const sourceDate = new Date(moment(allData.txtDate, 'D.M.Y h:m').format());

            const data = {
                ...allData,
                lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
                lastUpdatedAtSource: new Date(Date.UTC(sourceDate.getFullYear(), sourceDate.getMonth(), sourceDate.getDate(), sourceDate.getHours(), sourceDate.getMinutes())).toISOString(),
                country: 'Poland',
                sourceUrl,
                historyData: 'https://api.apify.com/v2/datasets/L3VCmhMeX0KUQeJto/items?format=json&clean=1',
                readMe: 'https://apify.com/vaclavrut/covid-pl',
            };

            // Extract region data
            await page.goto(regionDataUrl, { timeout: 1000 * 120 });

            log.info('Waiting for region data to load...');
            await page.waitFor(10000);
            // const regionResponse = await Promise.all([
            //     page.waitForResponse(request => request.url().match(/where=1.*1.*spatialRel=esriSpatialRelIntersects.*resultRecordCount=25/g)),
            // ]);
            log.info('Content loaded, Processing and saving data...')

            // const { features: regionData } = await regionResponse[0].json();
            // const infectedByRegion = regionData.map(({ attributes: {
            //     jpt_nazwa_, SUM_Confirmed, SUM_Deaths, KWARANTANNA, TESTY, TESTY_POZYTYWNE, TESTY_NEGATYWNE, SUM_Recovered
            // } }) => {
            //     return {
            //         region: jpt_nazwa_,
            //         infectedCount: SUM_Confirmed,
            //         recoveredCount: SUM_Recovered,
            //         deceasedCount: SUM_Deaths,
            //         testedCount: TESTY,
            //         quarantineCount: KWARANTANNA,
            //         testedPositive: TESTY_POZYTYWNE,
            //         testedNegative: TESTY_NEGATYWNE,
            //     }
            // });
            await Apify.utils.puppeteer.injectJQuery(page);

            const infectedByRegion = await page.evaluate( function () { 
                return $('div.widget.flex-vertical:contains(Osoby zakażone w województwach)')
                .find('div.external-html')
                .map(function () { return { infectedCount: $(this).find('strong').eq(0).text().trim(), region: $(this).find('span').eq(1).text().trim()}})
                .get();
            })
            data.infectedByRegion = infectedByRegion;
            // In case infected and deceased not found, calculte it from region data
            if (!data.infected) {
                data.infected = data.infectedByRegion.map(({ infectedCount }) => infectedCount)
                    .reduce((prev, cur) => {
                        return prev + cur;
                    }, 0);
            }
            // if (!data.deceased) {
            //     data.deceased = data.infectedByRegion.map(({ deceasedCount }) => deceasedCount)
            //         .reduce((prev, cur) => {
            //             return prev + cur;
            //         }, 0);
            // }

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
    log.info('Done.')
})
