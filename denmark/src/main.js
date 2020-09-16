// main.js
const Apify = require("apify");
const { log } = Apify.utils;

const LATEST = "LATEST";
const now = new Date();
const sourceUrl = "https://www.ssi.dk/sygdomme-beredskab-og-forskning/sygdomsovervaagning/c/covid19-overvaagning";

Apify.main(async () => {
    log.info("Starting actor.");

    const kvStore = await Apify.openKeyValueStore('COVID-19-DENMARK');
    const dataset = await Apify.openDataset('COVID-19-DENMARK-HISTORY');

    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest({
        url: 'https://services5.arcgis.com/Hx7l9qUpAnKPyvNz/arcgis/rest/services/stats_all_final/FeatureServer/0/query?f=json&where=1%3D1&returnGeometry=false&spatialRel=esriSpatialRelIntersects&outFields=*&orderByFields=Date%20desc&resultOffset=0&resultRecordCount=1&resultType=standard'
    });

    log.debug("Setting up crawler.");
    const cheerioCrawler = new Apify.CheerioCrawler({
        requestQueue,
        maxRequestRetries: 5,
        useApifyProxy: true,
        additionalMimeTypes: [
            "text/plain",
        ],
        handlePageFunction: async ({ request, body }) => {
            log.info(`Processing`, { url: request.url });
            log.info(`Processing and saving data.`);
            const { Date: date,
                Tests: tested,
                Unique_tests: uniqueTests,
                Infected: infected,
                Recovered: recovered,
                Dead: deaths,
                Daily_Infected: dailyInfected,
                Daily_Dead: dailyDead,
                Daily_Recovered: dailyRecovered,
                Admissions: admissions,
                Respirator: respirator,
                Intensive: intensive,
                New_Admissions: newAdmissions,
                Admissions_diff: admissionsDiff,
                Respirator_diff: respiratorDiff,
                Intensive_diff: intensiveDiff,
                Unique_tests_Diff: uniqueTestsDiff,
                Tests_Diff: testsDiff,
                Daily_Infected_Diff: dailyInfectedDiff,
            } = JSON.parse(body.toString()).features[0].attributes;

            const srcDate = new Date(date);

            const data = {
                tested, infected, recovered, deaths, dailyInfected, dailyDead, dailyRecovered,
                uniqueTests, admissions, respirator, intensive, newAdmissions,
                admissionsDiff, respiratorDiff, intensiveDiff, uniqueTestsDiff, testsDiff, dailyInfectedDiff,
                country: "Denmark",
                historyData: 'https://api.apify.com/v2/datasets/Ugq8cNqnhUSjfJeHr/items?format=json&clean=1',
                sourceUrl,
                lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
                lastUpdatedAtSource: new Date(Date.UTC(srcDate.getFullYear(), srcDate.getMonth(), srcDate.getDate(), srcDate.getHours(), srcDate.getMinutes())).toISOString(),
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
