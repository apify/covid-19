const Apify = require("apify");
const rp = require("request-promise");

Apify.main(async () => {
  const res = {};
  res.State = {};

  res.country = "Mexico";
  res.sourceUrl = "https://coronavirus.gob.mx/datos/";
  res.README = "https://apify.com/puorc/mexico-covid19?utm_source=app";
  res.historyData =
    "https://api.apify.com/v2/datasets/4efvuMEdxdQPCreW7/items?format=json&clean=1";

  const kvStore = await Apify.openKeyValueStore("COVID-19-MEXICO");
  const dataset = await Apify.openDataset("COVID-19-MEXICO-HISTORY");

  // Find total
  const nationOptions = {
    method: "POST",
    uri: "https://coronavirus.gob.mx/datos/Overview/info/getInfo.php",
    form: {
      cve: "000",
      nom: "Nacional",
      sPatType: "Confirmados",
    },
  };

  const parsedBody = await rp(nationOptions);

  const stripped = parsedBody.replace("<script>", "").replace("</script>", "");
  const statements = stripped.split(";");
  const keyMapping = {
    gsPosDIV: "infected",
    gsDefDIV: "deceased",
    gsNegDIV: "negative",
    gsSosDIV: "suspected",
  };

  for (let i = 1; i < statements.length; i++) {
    const st = statements[i];
    const extractNumberRE = /document.getElementById\("(\w*)"\).*\((\d*)\).toString/;
    const extractPercentageRE = /document.getElementById\("(\w+)"\).*"(.*)"/;

    const matchingNumber = extractNumberRE.exec(st);
    const matchingPerc = extractPercentageRE.exec(st);

    if (matchingNumber != null) {
      if (matchingNumber[1] in keyMapping) {
        const key = keyMapping[matchingNumber[1]];
        res[key] = Number.parseInt(matchingNumber[2]);
      }
    } else if (matchingPerc != null) {
      if (matchingPerc[1] in keyMapping) {
        const key = keyMapping[matchingPerc[1]];
        res[key] = matchingPerc[2];
      }
    } else {
      continue;
    }
  }

  // update some statistics
  res.tested = "N/A";
  res.recovered = "N/A";

  const detailOptions = [
    {
      method: "POST",
      uri: "https://coronavirus.gob.mx/datos/Overview/info/getInfo.php",
      form: {
        cve: "000",
        nom: "",
        sPatType: "Confirmados",
      },
    },
    {
      method: "POST",
      uri: "https://coronavirus.gob.mx/datos/Overview/info/getInfo.php",
      form: {
        cve: "000",
        nom: "",
        sPatType: "Defunciones",
      },
    },
  ];

  for (let i in detailOptions) {
    const options = detailOptions[i];
    const resp = await rp(options);
    const js_script = resp.replace("<script>", "").replace("</script>", "");
    const data_statement = js_script.match(/myTData = \[(.*\])\];/)[1];
    const elements = data_statement.split("],");
    for (let elem of elements) {
      const re = /<b>(.*)<\/b>.*\('(\d*)'\).*\('(\d*)'\)/;
      const matches = re.exec(elem);
      if (!(matches[1] in res["State"])) {
        res["State"][matches[1]] = {};
      }
      if (i == 0) {
        res["State"][matches[1]]["infected"] = Number.parseInt(matches[3]);
      } else {
        res["State"][matches[1]]["deceased"] = Number.parseInt(matches[3]);
      }
    }
  }

  res.lastUpdatedAtApify = new Date().toISOString();

  // try to discover updated date
  try {
    overview = await rp.post(
      "https://coronavirus.gob.mx/datos/Overview/overView.php"
    );
    const date_re = /Actualizado: (\d{2})-(\d{2})-(\d{4})/;
    matching = date_re.exec(overview);
    res.lastUpdatedAtSource = new Date(
      parseInt(matching[3]),
      parseInt(matching[2]) - 1,
      parseInt(matching[1])
    ).toISOString();
  } catch (e) {
    res.lastUpdatedAtSource = res.lastUpdatedAtApify;
  }

  // validate result
  for (const k in keyMapping) {
    const v = keyMapping[k];
    if (!(v in res)) {
      throw new Error("Bad data!");
    }
  }

  if (Object.keys(res.State).length != 32) {
    throw new Error("Bad data!");
  }

  for (const state in res.State) {
    const val = res.State[state];
    if (!Number.isInteger(val.infected) || !Number.isInteger(val.deceased)) {
      throw new Error("Bad data!");
    }
  }

  await Apify.setValue("LATEST", res);
  await kvStore.setValue("LATEST", res);
  await dataset.pushData(res);
  console.log(res);
});
