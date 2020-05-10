const Apify = require('apify');

// Apify.utils contains various utilities, e.g. for logging.
// Here we turn off the logging of unimportant messages.
const { log } = Apify.utils;
log.setLevel(log.LEVELS.WARNING);

// Apify.main() function wraps the crawler logic (it is optional).
Apify.main(async () => {
	const kv = await Apify.openKeyValueStore('COVID-19-LATVIA');
	const history = await Apify.openDataset('COVID-19-LATVIA-HISTORY');
	
    // Create and initialize an instance of the RequestList class that contains
    // a list of URLs to crawl. Here we use just a few hard-coded URLs.
    const requestList = new Apify.RequestList({
        sources: [
            { url: 'https://arkartassituacija.gov.lv/' },
        ],
    });
    await requestList.initialize();
	
	const DATA_INDEX = {
		TESTED: 3,
		INFECTED: 4,
	};

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
        // - html: contains raw HTML of the page
        // - $: the cheerio object containing parsed HTML
	    
        handlePageFunction: async ({ request, html, $ }) => {
            console.log(`Processing ${request.url}...`);
	
	        let matched = Array;
	        let lastUpdatedAtSource = "";
	        
	        const regepx = /([\d]+)/g;
	        $('.article.text p').each((index, el) => {
	        	let t = $(el).text();
	        	
	        	// Date
	        	if (index === 0) {
			        const [, day, time] = t.match(/Aktualizēts ([\S]+) plkst ([\S]+)/);
			        lastUpdatedAtSource = new Date(`${day.split('.').reverse().join('-')}T${time}:00+00:00`).toISOString();
		        }
		        
	        	// Not interested
	        	if (index !== 3) {
	        		return
		        }
	        	
	        	t = t.replace(/\s+/g, '');
		        matched = t.match(regepx);
	        });
	        
	        const tested = parseInt(matched[DATA_INDEX.TESTED]);
	        const infected = parseInt(matched[DATA_INDEX.INFECTED]);
	        const notInfected = tested - infected;

            // Store the results to the default dataset. In local configuration,
            // the data will be stored as JSON files in ./apify_storage/datasets/default
	        const data = {
		        url: request.url,
		        lastUpdatedAtSource,
		        tested,
		        infected,
		        notInfected,
	        };
	        
            await kv.setValue('LATEST', data)
	
	        const info = await history.getInfo();
	        if (info && info.itemCount > 0) {
		        const currentData = await history.getData({
			        limit: 1,
			        offset: info.itemCount - 1
		        });
		
		        if (currentData && currentData.items[0] && currentData.items[0].lastUpdatedAtSource !== lastUpdatedAtSource) {
			        await history.pushData(data);
		        }
	        } else {
		        await history.pushData(data);
	        }
	
	        // always push data to default dataset
	        await Apify.pushData(data);
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
