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
    await requestList.initialize();

    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        launchPuppeteerOptions: {
            useApifyProxy: true,
            apifyProxyGroups: ['SHADER'],
            // useChrome: true,
        },
        gotoFunction: ({ request, page }) => {
            return Apify.utils.puppeteer.gotoExtended(page, request, {
                waitUntil: 'networkidle2',
            })
        },
        handlePageFunction: async ({ request, page }) => {
            log.info(`Processing ${request.url}...`);
            await Apify.utils.puppeteer.injectJQuery(page);
            const data = {
                sourceUrl,
                lastUpdatedAtApify: moment().utc().second(0).millisecond(0).toISOString(),
                readMe: "https://apify.com/drobnikj/covid-france",
            };

            // Match infected
            const stringInfected = await page.evaluate(() => {
                return $('.counter:contains(cas confirmés)').eq(0).find('.value')
                    .clone()    //clone the element
                    .children() //select all the children
                    .remove()   //remove all the children
                    .end()  //again go back to selected element
                    .text();
            });
            if (stringInfected) {
                data.infected = parseInt(stringInfected.replace(/\s/g, ''));
            } else {
                throw new Error('Infected not found');
            }

            // Match deceased
            const stringRecovered = await page.evaluate(() => {
                return $('.counter:contains(retours à domicile)').eq(0).find('.value')
                    .clone()    //clone the element
                    .children() //select all the children
                    .remove()   //remove all the children
                    .end()  //again go back to selected element
                    .text();
            });
            if (stringRecovered) {
                data.recovered = parseInt(stringRecovered.replace(/\s/g, ''));
            } else {
                throw new Error('Recovered not found');
            }

            // Match deceased
            const stringDeceased = await page.evaluate(() => {
                return $('.counter:contains(cumul des décès)').eq(0).find('.value')
                    .clone()    //clone the element
                    .children() //select all the children
                    .remove()   //remove all the children
                    .end()  //again go back to selected element
                    .text();
            });
            if (stringDeceased) {
                data.deceased = parseInt(stringDeceased.replace(/\s/g, ''));
            } else {
                throw new Error('Deceased not found');
            }

            // Match hospital deceased
            const stringHospitalDeceased = await page.evaluate(() => {
                return $('.counter:contains(décès à l’hôpital)').eq(0).find('.value')
                    .clone()    //clone the element
                    .children() //select all the children
                    .remove()   //remove all the children
                    .end()  //again go back to selected element
                    .text();
            });
            if (stringHospitalDeceased) {
                data.hospitalDeceased = parseInt(stringHospitalDeceased.replace(/\s/g, ''));
            } else {
                throw new Error('Hospital deceased not found');
            }

            // Match hospitalized
            const stringHospitalized = await page.evaluate(() => {
                return $('.counter:contains(hospitalisations)').eq(0).find('.value')
                    .clone()    //clone the element
                    .children() //select all the children
                    .remove()   //remove all the children
                    .end()  //again go back to selected element
                    .text();
            });
            if (stringHospitalized) {
                data.hospitalized = parseInt(stringHospitalized.replace(/\s/g, ''));
            } else {
                throw new Error('Hospitalized not found');
            }

            // Match newly hospitalized
            const stringNewlyHospitalized = await page.evaluate(() => {
                return $('.counter:contains(nouveaux patients hospitalisés)').eq(0).find('.value')
                    .clone()    //clone the element
                    .children() //select all the children
                    .remove()   //remove all the children
                    .end()  //again go back to selected element
                    .text();
            });
            if (stringNewlyHospitalized) {
                data.newlyHospitalized = parseInt(stringNewlyHospitalized.replace(/\s/g, ''));
            } else {
                throw new Error('Newly hospitalized not found');
            }

            // Match intensive care
            const stringIntensiveCare = await page.evaluate(() => {
                return $('.counter:contains(en réanimation)').eq(0).find('.value')
                    .clone()    //clone the element
                    .children() //select all the children
                    .remove()   //remove all the children
                    .end()  //again go back to selected element
                    .text();
            });
            if (stringIntensiveCare) {
                data.intensiveCare = parseInt(stringIntensiveCare.replace(/\s/g, ''));
            } else {
                throw new Error('Intensive care not found');
            }            // Match newly intensive care
            const stringNewlyIntensiveCare = await page.evaluate(() => {
                return $('.counter:contains(en réanimation)').eq(1).find('.value')
                    .clone()    //clone the element
                    .children() //select all the children
                    .remove()   //remove all the children
                    .end()  //again go back to selected element
                    .text();
            });
            if (stringNewlyIntensiveCare) {
                data.newlyIntensiveCare = parseInt(stringNewlyIntensiveCare.replace(/\s/g, ''));
            } else {
                throw new Error('Newly intensive care not found');
            }

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
