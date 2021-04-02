const Apify = require('apify');
const moment = require('moment');
const _ = require('lodash');
const { log } = Apify.utils;

const LATEST = 'LATEST';

Apify.main(async () => {
    const sourceUrl = 'https://dashboard.covid19.data.gouv.fr/';
    const kvStore = await Apify.openKeyValueStore("COVID-19-FRANCE");
    const dataset = await Apify.openDataset("COVID-19-FRANCE-HISTORY");

    const requestList = new Apify.RequestList({
        sources: [
            { url: sourceUrl },
        ],
    });
    const proxyConfiguration = await Apify.createProxyConfiguration({
        useApifyProxy: false
    });

    await requestList.initialize();

    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        proxyConfiguration,
        launchPuppeteerOptions: {
            useChrome: true,
        },
        gotoFunction: ({ request, page }) => {
            return Apify.utils.puppeteer.gotoExtended(page, request, {
                waitUntil: 'networkidle2',
            })
        },
        handlePageFunction: async ({ request, page }) => {
            log.info(`Processing ${request.url}...`);
            await Apify.utils.puppeteer.injectJQuery(page);
            await page.waitForSelector('.stats');

            const extracted = await page.evaluate(() => {
                const toNumber = (str) => parseInt(str.replace(/\D+/g, ''), 10);

                const selectors = [
                    { infected: '.counter:contains(cas confirmés)', index: 0, errMesssage: 'infected' },
                    { recoverd: '.counter:contains(retours à domicile)', index: 0, errMesssage: 'recovered' },
                    { deceased: '.counter:contains(décès à l’hôpital)', index: 0, errMesssage: 'deceased' },
                    { hospitalDeceased: '.counter:contains(décès à l’hôpital)', index: 0, errMesssage: 'hospital deceased' },
                    { hospitalized: '.counter:contains(patients hospitalisés)', index: 0, errMesssage: 'hospitalized' },
                    { newlyHospitalized: '.counter:contains(nouveaux patients hospitalisés)', index: 0, errMesssage: 'newly hospitalized' },
                    { intensiveCare: '.counter:contains(en réanimation)', index: 0, errMesssage: 'intensive care' },
                    { newlyIntensiveCare: '.counter:contains(en réanimation)', index: 1, errMesssage: 'intensive care' }
                ];
                const extracted = {};
                for (const selec of selectors) {
                    const values = Object.values(selec);
                    const value = $(values[0]).eq(values[1]).find('.value')
                        .clone()    //clone the element
                        .children() //select all the children
                        .remove()   //remove all the children
                        .end()  //again go back to selected element
                        .text();
                    if (!value) {
                        throw new Error(`${values[2]} not found`);
                    }
                    extracted[Object.keys(selec)[0]] = toNumber(value);
                }
                return extracted;
            });

            const data = {
                ...extracted,
                sourceUrl,
                lastUpdatedAtApify: moment().utc().second(0).millisecond(0).toISOString(),
                readMe: "https://apify.com/drobnikj/covid-france",
            };

            // Match updatedAt
            const stringUpdatedAt = await page.evaluate(() => {
                return $('h3:contains(Données au)').text();
            });
            console.log(stringUpdatedAt)
            const matchUpadatedAt = stringUpdatedAt.match(/(\d+)\/(\d+)\/(\d+)/);
            if (matchUpadatedAt && matchUpadatedAt.length > 3) {
                data.lastUpdatedAtSource = moment({
                    year: parseInt(matchUpadatedAt[3]),
                    month: parseInt(matchUpadatedAt[2]) - 1,
                    date: parseInt(matchUpadatedAt[1]),
                    hour: 0,
                    minute: 0,
                    second: 0,
                    millisecond: 0
                }).toISOString();
            } else {
                throw new Error('lastUpdatedAtSource not found');
            }

            console.log(data)

            // Compare and save to history
            const latest = await kvStore.getValue(LATEST) || {};
            if (!_.isEqual(_.omit(data, 'lastUpdatedAtApify'), _.omit(latest, 'lastUpdatedAtApify'))) {
                await dataset.pushData(data);
            }

            await kvStore.setValue(LATEST, data);
            await Apify.pushData(data);
        },

        handleFailedRequestFunction: async ({ request }) => {
            throw new Error('Scrape didn\'t finish! Needs to be check!');
        },
    });

    // Run the crawler and wait for it to finish.
    await crawler.run();

    log.info('Crawler finished.');
});