// main.js
const Apify = require("apify");
const { log } = Apify.utils;

const LATEST = "LATEST";
const now = new Date();
const sourceUrl = "http://covid-19.moh.gov.my/";

Apify.main(async () => {
  log.info("Starting actor.");

  const kvStore = await Apify.openKeyValueStore("COVID-19-MY");
  const dataset = await Apify.openDataset("COVID-19-MY-HISTORY");

  const requestQueue = await Apify.openRequestQueue();
  await requestQueue.addRequest({
    url: sourceUrl,
    userData: {
      label: "GET_IFRAME",
    },
  });

  log.debug("Setting up crawler.");
  const cheerioCrawler = new Apify.CheerioCrawler({
    requestQueue,
    maxRequestRetries: 5,
    requestTimeoutSecs: 60,
    useApifyProxy: true,
    // additionalMimeTypes: [''],
    handlePageFunction: async ({ request, $, body }) => {
      const { label } = request.userData;
      log.info("Page opened.", { label, url: request.url });

      switch (label) {
        case "GET_IFRAME":
          const iframUrl = $("header script")
            .attr("id")
            .match(/(?<=_)[^_]+$/g)[0];
          await requestQueue.addRequest({
            url: `https://e.infogram.com/${iframUrl}`,
            userData: {
              label: "EXTRACT_DATA",
            },
          });
          break;
        case "EXTRACT_DATA":
          log.info("Processing and saving data...");

          const values = body.match(/(?<="text":")\d+(?=")/g);
          const srcDate = new Date(
            body.match(/(?<=updatedAt":")[^"]+(?=")/g)[0]
          );

          console.log(values);

          const data = {
            testedPositive: toNumber(values[0]),
            recovered: toNumber(values[3]),
            activeCases: toNumber(values[1]),
            inICU: toNumber(values[5]),
            respiratoryAid: toNumber(values[6]),
            deceased: toNumber(values[2]),
            country: "Malaysia",
            historyData:
              "https://api.apify.com/v2/datasets/7Fdb90FMDLZir2ROo/items?format=json&clean=1",
            sourceUrl,
            lastUpdatedAtApify: new Date(
              Date.UTC(
                now.getFullYear(),
                now.getMonth(),
                now.getDate(),
                now.getHours(),
                now.getMinutes()
              )
            ).toISOString(),
            lastUpdatedAtSource: new Date(
              Date.UTC(
                srcDate.getFullYear(),
                srcDate.getMonth(),
                srcDate.getDate(),
                srcDate.getHours(),
                srcDate.getMinutes()
              )
            ).toISOString(),
            readMe: "https://apify.com/zuzka/covid-my",
          };

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

const toNumber = (txt) => parseInt(txt.replace(/\D/g, "", 10));
