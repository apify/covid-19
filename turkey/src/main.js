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

      const numbers = $("#bg-logo span[class]")
        .map((i, el) => $(el).text().trim().replace(/\D/g, ""))
        .get()
        .filter((text) => text.match(/\d/))
        .map((text) => parseInt(text, 10));

      const tested = numbers[0];
      const infected = numbers[1];
      const deceased = numbers[2];
      const recovered = numbers[5];
      const dailyTested = numbers[6];
      const dailyInfected = numbers[7];
      const dailyDeceased = numbers[8];
      const dailyRecovered = numbers[9];

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
