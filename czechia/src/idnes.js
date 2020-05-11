const Apify = require("apify");
const cheerio = require("cheerio");
const getDataFromIdnes = async ()=>{
    let infectedByBabisNewspapers;
    try {
        const response = await Apify.utils.requestAsBrowser({
            url: "https://www.idnes.cz/",
            proxyUrl: Apify.getApifyProxyUrl({groups: ["SHADER"]}),
            abortFunction: () => false,
        });
        const $ = await cheerio.load(response.body);
        const liList = $("ul.megapruh-counts li");
        const totalInfected = $(liList).eq(1).find("a").html();
        const totalDeaths = $(liList).eq(3).find("a").html();
        const totalCured = $(liList).eq(2).find("a").html();
        const totalTested = $(liList).eq(0).find("a").html();

        const localeTextNumberToInt = txt => parseInt(txt.replace("&#xFFFD;", ""), 10);
        infectedByBabisNewspapers = {
            totalInfected: localeTextNumberToInt(totalInfected),
            totalDeaths: localeTextNumberToInt(totalDeaths),
            totalCured: localeTextNumberToInt(totalCured),
            totalTested: localeTextNumberToInt(totalTested),
        }
    } catch (e) {
        console.log("Could not get data from Idnes", e);
    }
    return  infectedByBabisNewspapers;
};

module.exports = getDataFromIdnes;
