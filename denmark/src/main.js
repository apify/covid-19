// main.js
const Apify = require("apify");
const { log } = Apify.utils;
const moment = require("moment")

const LATEST = "LATEST";
const now = new Date();
// const sourceUrl = "https://www.ssi.dk/sygdomme-beredskab-og-forskning/sygdomsovervaagning/c/covid19-overvaagning";
const sourceUrl = "https://www.sst.dk/en/english/corona-eng/status-of-the-epidemic/covid-19-updates-statistics-and-charts";
const toNumber = (str) => parseInt(str.split('\n').filter(str => str)[0].replace(/\D+/g, ''), 10);

Apify.main(async () => {
    log.info("Starting actor.");

    const kvStore = await Apify.openKeyValueStore('COVID-19-DENMARK');
    const dataset = await Apify.openDataset('COVID-19-DENMARK-HISTORY');

    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest({
        url: 'https://www.sst.dk/en/english/corona-eng/status-of-the-epidemic/covid-19-updates-statistics-and-charts'
    });

    log.debug("Setting up crawler.");
    const cheerioCrawler = new Apify.CheerioCrawler({
        requestQueue,
        maxRequestRetries: 5,
        useApifyProxy: true,
        additionalMimeTypes: [
            "text/plain",
        ],
        handlePageFunction: async ({ request, $ }) => {
            log.info(`Processing`, { url: request.url });
            log.info(`Processing and saving data.`);
            const extractedDate = $('span:contains(Updated)').eq(0).text().split('-')[0];
            const sourceDate = new Date(moment(extractedDate, 'DD MMMM YYYY HH A').format());

            const data = {
                tested: toNumber($('td:contains(Persons tested)').eq(0).next().text()),
                pcrTests: toNumber($('td:contains(PCR test)').eq(0).next().text()),
                infected: toNumber($('td:contains(Confirmed cases)').eq(0).next().text()),
                recovered: toNumber($('td:contains(Recovered)').eq(0).next().text()),
                deceased: toNumber($('td:contains(Deaths)').eq(0).next().text()),
                antigenTest: toNumber($('td:contains(Antigen test)').eq(0).next().text()),
                initiatedVaccination: toNumber($('td:contains(Vaccination initiated)').eq(0).next().text()),
                fullyVaccination: toNumber($('td:contains(Fully vaccinated)').eq(0).next().text()),
                dailyTested: toNumber($('td:contains(Persons tested)').eq(1).next().text()),
                dailyPcrTests: toNumber($('td:contains(PCR test)').eq(1).next().text()),
                dailyInfected: toNumber($('td:contains(Confirmed cases)').eq(1).next().text()),
                dailyRecovered: toNumber($('td:contains(Recovered)').eq(1).next().text()),
                dailyDead: toNumber($('td:contains(Deaths)').eq(1).next().text()),
                dailyAntigenTest: toNumber($('td:contains(Antigen test)').eq(1).next().text()),
                dailyHospitalised: toNumber($('td:contains(Hospitalised)').eq(0).next().text()),
                dailyIntensiveCare: toNumber($('td:contains(intensive care)').eq(0).next().text()),
                dailyInitiatedVaccination: toNumber($('td:contains(Vaccination initiated)').eq(0).nextAll().eq(1).text()),
                dailyFullyVaccination: toNumber($('td:contains(Fully vaccinated)').eq(0).nextAll().eq(1).text()),
                country: "Denmark",
                historyData: 'https://api.apify.com/v2/datasets/Ugq8cNqnhUSjfJeHr/items?format=json&clean=1',
                sourceUrl,
                lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
                lastUpdatedAtSource: new Date(Date.UTC(sourceDate.getFullYear(), sourceDate.getMonth(), sourceDate.getDate(), sourceDate.getHours(), sourceDate.getMinutes())).toISOString(),
                readMe: 'https://apify.com/tugkan/covid-dk'
            };

            console.log(data)

            // Push the data
            let latest = await kvStore.getValue(LATEST);
            if (!latest) {
                await kvStore.setValue("LATEST", data);
                latest = Object.assign({}, data);
            }
            delete latest.lastUpdatedAtApify;
            const actual = Object.assign({}, data);
            delete actual.lastUpdatedAtApify;

            const { itemCount } = await dataset.getInfo();
            if (
                JSON.stringify(latest) !== JSON.stringify(actual) ||
                itemCount === 0
            ) {
                await dataset.pushData(data);
            }

            await kvStore.setValue("LATEST", data);
            await Apify.pushData(data);

            log.info("Data saved.");

        },
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed many times.`);
            console.dir(request);
        },
    });
    // Run the crawler and wait for it to finish.
    log.info("Starting the crawl.");
    await cheerioCrawler.run();
    log.info("Actor finished.");
});
