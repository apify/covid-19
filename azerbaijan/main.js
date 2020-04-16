const Apify = require('apify');

// Apify.utils contains various utilities, e.g. for logging.
// Here we turn off the logging of unimportant messages.
const { log } = Apify.utils;
log.setLevel(log.LEVELS.WARNING);

const LATEST = 'LATEST';

// Apify.main() function wraps the crawler logic (it is optional).
Apify.main(async () => {
    // Create and initialize an instance of the RequestList class that contains
    // a list of URLs to crawl. Here we use just a few hard-coded URLs.
    const requestList = new Apify.RequestList({
        sources: [
            { url: 'https://koronavirusinfo.az/az/page/statistika/azerbaycanda-cari-veziyyet' },
        ],
    });

    const kvStore = await Apify.openKeyValueStore('COVID-19-AZERBAIJAN');
    const dataset = await Apify.openDataset('COVID-19-AZERBAIJAN-HISTORY');

    await requestList.initialize();

    // Create an instance of the CheerioCrawler class - a crawler
    // that automatically loads the URLs and parses their HTML using the cheerio library.
    const crawler = new Apify.CheerioCrawler({
        // Let the crawler fetch URLs from our list.
        requestList,

        // The crawler downloads and processes the web pages in parallel, with a concurrency
        // automatically managed based on the available system memory and CPU (see AutoscaledPool class).
        // Here we define some hard limits for the concurrency.
        minConcurrency: 10,
        maxConcurrency: 50,

        // On error, retry each page at most once.
        maxRequestRetries: 1,

        // Increase the timeout for processing of each page.
        handlePageTimeoutSecs: 60,

        // This function will be called for each URL to crawl.
        // It accepts a single parameter, which is an object with the following fields:
        // - request: an instance of the Request class with information such as URL and HTTP method
        // - body: contains body of the page
        // - $: the cheerio object containing parsed HTML
        handlePageFunction: async ({ request, body, $ }) => {
            console.log(`Processing ${request.url}...`);

            // Extract data from the page using cheerio.
            let DATA = {};
            $('.gray_little_statistic').each((index, el) => {
                switch ($(el).children('span').text()) {
                    case 'Virusa yoluxan':
                        DATA['infected'] = parseInt($(el).children('strong').text());
                        break;
                    case 'Sağalan':
                        DATA['recovered'] = parseInt($(el).children('strong').text());
                        break;
                    case 'Ölüm halı':
                        DATA['deceased'] = parseInt($(el).children('strong').text());
                        break;
                    case 'Müayinə aparılıb':
                        DATA['tested'] = parseInt($(el).children('strong').text().replace(',', ''));
                        break;
                }
            });
            DATA = {
                country: 'Azerbaijan',
                ...DATA,
                sourceUrl: request.url,
                lastUpdatedAtApify: new Date(new Date().toUTCString()).toISOString(),
                lastUpdatedAtSource: "N/A" // currently unavailable
            }

            // Compare and save to history
            const latest = await kvStore.getValue(LATEST) || {};
            delete latest.lastUpdatedAtApify;

            const actual = Object.assign({}, DATA);
            delete actual.lastUpdatedAtApify;

            // Store the results to the default dataset. In local configuration,
            // the data will be stored as JSON files in ./apify_storage/datasets/default
            await Apify.pushData({...DATA});

            if (JSON.stringify(latest) !== JSON.stringify(actual)) {
                log.info('Data did change :( storing new to dataset.');
                await dataset.pushData(DATA);
            }

            await kvStore.setValue(LATEST, DATA);
            log.info('Data stored, finished.');
        },

        // This function is called if the page processing failed more than maxRequestRetries+1 times.
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed twice.`);
        },
    });

    // Run the crawler and wait for it to finish.
    await crawler.run();

    console.log('Crawler finished.');
});
