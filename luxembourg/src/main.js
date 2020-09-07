// main.js
const Apify = require('apify');
const XLSX = require("xlsx");
const { log } = Apify.utils;

const LATEST = 'LATEST';

const sourceUrl = 'https://data.public.lu/fr/datasets/donnees-covid19/';
const now = new Date();

Apify.main(async () => {

    log.info('Starting actor.');
    const kvStore = await Apify.openKeyValueStore('COVID-19-LUXEMBOURG');
    const dataset = await Apify.openDataset('COVID-19-LUXEMBOURG-HISTORY');

    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest({
        url: 'https://data.public.lu/fr/datasets/donnees-covid19/',
        userData: {
            label: 'GET_XLSX_LINK'
        }
    })

    const cheerioCrawler = new Apify.CheerioCrawler({
        requestQueue,
        requestTimeoutSecs: 90,
        useApifyProxy: true,
        handleRequestTimeoutSecs: 120,
        additionalMimeTypes: [
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "text/plain",
        ],
        prepareRequestFunction: async ({ request }) => {
            if (request.url.endsWith(".xlsx")) {
                log.info(`Proccecing ${request.url}`);
                log.info(`Downloading xlsx file ...`);
            }
        },
        handlePageFunction: async ({ request, $, body }) => {
            const { label } = request.userData;
            switch (label) {
                case "GET_XLSX_LINK":
                    log.info(`Proccecing ${request.url}`);
                    log.info(`Getting xlsx download link.`);
                    const { contentUrl, dateModified: fileDateModified } = JSON.parse($('script#json_ld').html().replace(/\\|/g, '')).distribution[1];

                    await requestQueue.addRequest({
                        url: contentUrl,
                        userData: {
                            label: 'EXTRACT_DATA',
                            dateModified: fileDateModified,
                        }
                    })
                    break;
                case "EXTRACT_DATA":
                    log.info(`File had downloaded.`);
                    log.info(`Processing and saving data.`);
                    let workbook = XLSX.read(body, { type: "buffer" });

                    const total = XLSX.utils.sheet_to_json(workbook.Sheets["Sheet1"]);

                    // Extract date
                    const srcDate = new Date(request.userData.dateModified);
                    const lastItem = total.pop();
                    const data = {
                        tested: lastItem["Nombre tests total cumulés (résidents)"],
                        infected: lastItem["Nouvelles infections (résidents)"],
                        deceased: lastItem["[1.NbMorts]"],
                        intensiveCare: lastItem["Soins intensifs"],
                        normalCare: lastItem["Soins normaux"],
                        newlyTested: lastItem["Nombre tests total (résidents)"],
                        newlyInfected: lastItem["Personnes testées (résidents)"],
                        newlyRecovered: lastItem["[9.TotalPatientDepartHopital]"],
                        sourceUrl,
                        country: ' Luxembourg',
                        historyData: 'https://api.apify.com/v2/datasets/oZH6thpQSdIyo3ky2/items?format=json&clean=1',
                        lastUpdatedAtSource: new Date(Date.UTC(srcDate.getFullYear(), srcDate.getMonth(), srcDate.getDate(), srcDate.getHours(), srcDate.getMinutes())).toISOString(),
                        lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
                        readMe: 'https://apify.com/tugkan/covid-lu',
                    }
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
                    break;
                default:
                    break;
            }
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