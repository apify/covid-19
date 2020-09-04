const Apify = require("apify");

const { log, requestAsBrowser } = Apify.utils;
const sourceUrl = "https://covid19.saglik.gov.tr/";
const LATEST = "LATEST";

Apify.main(async () => {
  const requestQueue = await Apify.openRequestQueue();
  const kvStore = await Apify.openKeyValueStore("COVID-19-TURKEY");
  const dataset = await Apify.openDataset("COVID-19-TURKEY-HISTORY");

  await requestQueue.addRequest({ url: sourceUrl });
  const crawler = new Apify.CheerioCrawler({
    requestQueue,
    useApifyProxy: true,
    handlePageTimeoutSecs: 60 * 2,
    useSessionPool: true,
    handlePageFunction: async (context) => {
      const { $, request, session } = context;
      log.info("Page loaded.");
      const now = new Date();

      const tested = $('.toplam-test-sayisi').text();
      const infected = $('.toplam-vaka-sayisi').text();
      const deceased = $('.toplam-vefat-sayisi').text();
      const recovered = $('.toplam-iyilesen-hasta-sayisi').text();
      const dailyTested = $('.bugunku-test-sayisi').text();
      const dailyInfected = $('.bugunku-vaka-sayisi').text();
      const dailyDeceased = $('.bugunku-vefat-sayisi').text();
      const dailyRecovered = $('.bugunku-iyilesen-hasta-sayisi').text();

      // Turkish month name map
      const turkMonthNames = [
        "OCAK",
        "ŞUBAT",
        "MART",
        "NİSAN",
        "MAYIS",
        "HAZİRAN",
        "TEMMUZ",
        "AĞUSTOS",
        "EYLÜL",
        "EKİM",
        "KASIM",
        "ARALIK",
      ];

      // English month name map
      const englMonthNames = [
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
      ];

      const [month, day, year] = $(".takvim")
        .text()
        .trim()
        .replace(/\s+/g, " ")
        .split(" ");

      let lastUpdatedParsed = undefined;

      if (turkMonthNames.indexOf(month) !== -1) {
        lastUpdatedParsed = new Date(
          `${turkMonthNames.indexOf(month) + 1}.${day}.${year}`
        );
      } else if (englMonthNames.indexOf(month.toLowerCase()) !== -1) {
        lastUpdatedParsed = new Date(
          `${englMonthNames.indexOf(month.toLowerCase()) + 1}.${day.replace(
            /\D/g,
            ""
          )}.${year}`
        );
      } else {
        throw new Error("Invalid time value");
      }

      const returningData = {
        tested,
        infected,
        deceased,
        recovered,
        dailyTested,
        dailyInfected,
        dailyDeceased,
        dailyRecovered,
        sourceUrl,
        lastUpdatedAtSource: lastUpdatedParsed.toISOString(),
        lastUpdatedAtApify: new Date(
          Date.UTC(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            now.getHours(),
            now.getMinutes()
          )
        ).toISOString(),
        readMe: "https://apify.com/tugkan/covid-tr",
      };

      console.log(returningData);
      
      // Compare and save to history
      const latest = (await kvStore.getValue(LATEST)) || {};
      delete latest.lastUpdatedAtApify;
      const actual = Object.assign({}, returningData);
      delete actual.lastUpdatedAtApify;

      await Apify.pushData({ ...returningData });

      if (JSON.stringify(latest) !== JSON.stringify(actual)) {
        log.info("Data did change :( storing new to dataset.");
        await dataset.pushData(returningData);
      }

      await kvStore.setValue(LATEST, returningData);
      log.info("Data stored, finished.");
    },

    // This function is called if the page processing failed more than maxRequestRetries+1 times.
    handleFailedRequestFunction: async ({ request }) => {
      console.log(`Request ${request.url} failed twice.`);
    },
  });

  // Run the crawler and wait for it to finish.
  await crawler.run();

  console.log("Crawler finished.");
});
