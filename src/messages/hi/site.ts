import type { Messages } from "../en";

/** Hindi words for requests from a kennel's own website (M68): a first draft, to be checked by a native speaker. Part of hi.ts. */
export const siteArea: Pick<Messages, "site"> = {
  site: {
    title: "आपकी अपनी वेबसाइट",
    address: "आपकी वेबसाइट का पता",
    addressHint: "जैसे https://yourkennel.com, इसके बाद कुछ नहीं। फिर उसके बुकिंग और खाने के फ़ॉर्म Wagbook को भेज सकते हैं। ख़ाली छोड़ें तो वे नहीं भेज सकते।",
    sendTo: "आपकी वेबसाइट के फ़ॉर्म यहाँ भेजते हैं: {url}",
    error: "पता https:// और नाम से लिखें, इसके बाद कुछ नहीं, जैसे https://yourkennel.com।",
    ref: "वेबसाइट का नंबर {ref}",
    came: "यहाँ से आए: {source}",
    unavailable: "यह केनेल अभी अपनी वेबसाइट से अनुरोध नहीं ले रहा है। कृपया उन्हें WhatsApp पर मैसेज करें।",
    notAllowed: "अनुरोध सिर्फ़ केनेल की अपनी वेबसाइट से लिए जाते हैं।",
    unreadable: "अनुरोध पढ़ा नहीं जा सका। पेज रीफ़्रेश करके फिर कोशिश करें।",
    refusals: {
      name: "अपना नाम लिखें।",
      phone: "सही मोबाइल नंबर लिखें।",
      pet: "अपने कुत्ते का नाम लिखें।",
      dates: "तारीख़ें चुनें।",
      address: "पता लिखें।",
      pin: "छह अंकों का पिन कोड लिखें।",
      weight: "अपने कुत्ते का वज़न किलो में लिखें, जैसे 12.5।",
      consent: "सहमति के लिए बॉक्स पर टिक करें।",
      service: "चुनें कि आपको क्या चाहिए।",
      food: "चुनें कि आपको क्या चाहिए।",
    },
  },
};
