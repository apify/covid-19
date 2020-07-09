// main.js
const Apify = require('apify');
const XLSX = require('xlsx')
const { log } = Apify.utils;

const LATEST = "LATEST";
const now = new Date();
const sourceUrl = 'https://www.gov.si/en/topics/coronavirus-disease-covid-19/actual-data/';

Apify.main(async () => {

    log.info('Starting actor.');

    const kvStore = await Apify.openKeyValueStore("COVID-19-SLOVENIA");
    const dataset = await Apify.openDataset("COVID-19-SLOVENIA-HISTORY");
    const requestList = new Apify.RequestList({
        sources: [
            {
                url: 'http://www.gov.si/assets/vlada/Koronavirus-podatki/en/EN_Covid-19-all-data.xlsx',
            }
        ],
    });

    await requestList.initialize();

    log.debug('Setting up crawler.');
    const cheerioCrawler = new Apify.CheerioCrawler({
        requestList,
        maxRequestRetries: 5,
        requestTimeoutSecs: 90,
        useApifyProxy: true,
        additionalMimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain'],
        prepareRequestFunction: async ({ request }) => {
            log.info(`Downloading xlsx file ...`)
        },
        handlePageFunction: async ({ body }) => {

            log.info(`File had downloaded.`);

            log.info(`Processing and saving data.`);

            let workbook = XLSX.read(body, { type: "buffer" });

            const { ModifiedDate } = workbook.Props;
            const atSource = new Date(ModifiedDate)

            const everything = XLSX.utils.sheet_to_json(workbook.Sheets['Covid-19 podatki']);
            console.log(typeof everything[everything.length - 4]['Date']);

            let lastApdate = {};

            for (i = (everything.length - 1); i > 0; i--) {
                if (typeof everything[i]['Date'] === 'number') {
                    lastApdate = everything[i];
                    break;
                }
            };

            const data = {
                testedCases: lastApdate['Tested (all)'],
                infectedCases: lastApdate['Positive (all)'],
                numberOfDeath: lastApdate['Deaths (all)'],
                dailyTested: lastApdate['Tested (daily)'],
                dailyInfected: lastApdate['Positive (daily)'],
                dailyDeaths: lastApdate['Deaths (daily)'],
                dailyDischarged: lastApdate.Discharged,
                dailyHospitalized: lastApdate['All hospitalized on certain day'],
                dailyIntensiveCare: lastApdate['All persons in intensive care on certain day'],
                country: 'slovenia',
                historyData: 'https://api.apify.com/v2/datasets/H6HKZRQr8I81bClnb/items?format=json&clean=1',
                sourceUrl: sourceUrl,
                lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
                lastUpdatedAtSource: new Date(Date.UTC(atSource.getFullYear(), atSource.getMonth(), atSource.getDate(), (atSource.getHours()), atSource.getMinutes())).toISOString(),
                readMe: 'https://apify.com/dtrungtin/covid-si'
            }
            console.log(data);
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

            log.info('Data had saved.');
        },
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed many times.`);
            console.dir(request)
        },
    });
    // Run the crawler and wait for it to finish.
    log.info('Starting the crawl.');
    await cheerioCrawler.run();
    log.info('Actor finished.');
});

