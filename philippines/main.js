const Apify = require("apify");
const moment = require('moment');

const LATEST = "LATEST";
const sourceUrl = "https://www.covid19.gov.ph/";

Apify.main(async () => {
  console.log("Starting actor.");

  const kvStore = await Apify.openKeyValueStore("COVID-19-PH");
  const dataset = await Apify.openDataset("COVID-19-PH-HISTORY");

 
      
  try{

  console.log('Launching Puppeteer...');
  const browser = await Apify.launchPuppeteer();

  const page = await browser.newPage();

  console.log('Going to the website...');
  await page.goto(sourceUrl);
  await Apify.utils.puppeteer.injectJQuery(page);

  await page.waitFor(4000);

  console.log('Getting data...');

  const result = await page.evaluate(() =>
  {

    const now = new Date();
    const getInt = (x)=>{
      return parseInt(x.replace(' ','').replace(',',''))};

    const infected = $('h6:contains(Active cases)').parent().find('span:contains(Based on)').text().split(' ')[2];
    const recovered = $('h6:contains(Recovered)').parent().find('h4').text();
    const deceased = $('h6:contains(Deaths)').parent().find('h4').text();
    const activeCases = $('h6:contains(Active cases)').parent().find('h4').text();
    const lastUpdatedAtSourceText = $('p:contains(Updated)').first().text().split(' ');
          
    const data = {
      "infected": getInt(infected),
      "tested": "N/A",
      "recovered": getInt(recovered),
      "deceased": getInt(deceased),
      "activeCases": getInt(activeCases),
      "country": "Philippines",
      "historyData": "https://api.apify.com/v2/datasets/sFSef5gfYg3soj8mb/items?format=json&clean=1",
      "sourceUrl": "https://www.covid19.gov.ph/",
      "lastUpdatedAtApify": new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
      "lastUpdatedAtSource": lastUpdatedAtSourceText,
      "readMe": "https://apify.com/katerinahronik/covid-philippines"
    }
        
    return data;
        
    });       
      
      const year = result.lastUpdatedAtSource[7];
      const month = moment().month(result.lastUpdatedAtSource[6]).format("M");
      const day = result.lastUpdatedAtSource[5];
      const dateString = `${year}-${month}-${day}`;
      result.lastUpdatedAtSource = moment(dateString).format();

      console.log(result)
  
      if ( !result.infected || !result.deceased || !result.recovered || !result.activeCases) {
                  throw "One of the output is null";
              }
      else {
              let latest = await kvStore.getValue(LATEST);
              if (!latest) {
                  await kvStore.setValue('LATEST', result);
                  latest = result;
              }
              delete latest.lastUpdatedAtApify;
              const actual = Object.assign({}, result);
              delete actual.lastUpdatedAtApify;
  
              if (JSON.stringify(latest) !== JSON.stringify(actual)) {
                  await dataset.pushData(result);
              }
  
              await kvStore.setValue('LATEST', result);
              await Apify.pushData(result);
          }
  
  
      console.log('Closing Puppeteer...');
      await browser.close();
      console.log('Done.');  
      

  }
  catch(err){
  
      console.log(err)
  
      let latest = await kvStore.getValue(LATEST);
      var latestKvs = latest.lastUpdatedAtApify;
      var latestKvsDate = new Date(latestKvs)
      var d = new Date();
      // adding two hours to d
      d.setHours(d.getHours() - 2);
      if (latestKvsDate < d) {
          throw (err)
      }
  }
  });
