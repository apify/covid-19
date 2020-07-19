// main.js
const Apify = require("apify");
const cheerio = require("cheerio");

const { requestAsBrowser, log } = Apify.utils;

const LATEST = "LATEST";
const now = new Date();
const sourceUrl = "http://www.covid19.gov.ph/";

Apify.main(async () => {
  log.info("Starting actor.");

  const kvStore = await Apify.openKeyValueStore("COVID-19-PH");
  const dataset = await Apify.openDataset("COVID-19-PH-HISTORY");

  const requestQueue = await Apify.openRequestQueue();
  await requestQueue.addRequest({
    url: sourceUrl,
  });
  const basicCrawler = new Apify.BasicCrawler({
    requestQueue,
    useApifyProxy: true,
    maxRequestRetries: 5,
    requestTimeoutSecs: 60,
    handleRequestFunction: async ({ request }) => {
      const { url, headers } = request;
      const response = await requestAsBrowser({
        url,
        headers: { ...headers },
        ignoreSslErrors: false,
        followRedirect: false,
      });
      const $ = cheerio.load(response.body);
      log.info("Processing and saving data.");
      const data = {};

      // data.infected = toNumber($("div:contains(Confirmed)").last().parent().text());
      const values = $("span[data-to-value]");
      data.infected = parseInt($(values).eq(1).attr("data-to-value"), 10);
      data.tested = "N/A";
      data.recovered = parseInt($(values).eq(2).attr("data-to-value"), 10);
      data.deceased = parseInt($(values).eq(3).attr("data-to-value"), 10);
      data.activeCases = parseInt($(values).eq(0).attr("data-to-value"), 10);

      const sourceDate = new Date(
        $("a:contains(COVID-19 TRACKER)")
          .text()
          .trim()
          .match("(?<=AS OF ).*")[0]
          .replace("AM", " AM")
          .replace("PM", " PM")
          .replace("PST", "")
          .trim()
      );

      // ADD: country, historyData, sourceUrl, lastUpdatedAtSource, lastUpdatedAtApify, readMe
      data.country = "Philippines";
      data.historyData =
        "https://api.apify.com/v2/datasets/sFSef5gfYg3soj8mb/items?format=json&clean=1";
      data.sourceUrl = sourceUrl;
      data.lastUpdatedAtApify = new Date(
        Date.UTC(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          now.getHours(),
          now.getMinutes()
        )
      ).toISOString();
      data.lastUpdatedAtSource = new Date(
        Date.UTC(
          sourceDate.getFullYear(),
          sourceDate.getMonth(),
          sourceDate.getDate(),
          sourceDate.getHours() - 8,
          sourceDate.getMinutes()
        )
      ).toISOString();
      data.readMe = "https://apify.com/katerinahronik/covid-philippines";

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

  log.debug("Setting up crawler.");

  // Run the crawler and wait for it to finish.
  log.info("Starting the crawl.");
  await basicCrawler.run();
  log.info("Actor finished.");
});
