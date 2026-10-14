/*
 * Airport catalog: ~140 real airports with IATA code, city, official name,
 * ISO country, coordinates and IANA time zone, plus a small climate table
 * used by the weather generator. Search is diacritics- and case-insensitive.
 * `resolveAirport` never throws: anything unknown becomes a deterministic
 * synthetic airport (known: false).
 */
import type { Airport } from "./types";
import { hashString } from "./random";

type Row = [
  code: string,
  city: string,
  name: string,
  country: string,
  lat: number,
  lon: number,
  tz: string,
  /** Approximate mean temperature in January and July (°C) and the share of
   *  January / July days with rain (or snow) in percent. */
  climate: [janC: number, julC: number, rainJanPct: number, rainJulPct: number],
];

// Order matters: the first airport listed for a city is that city's primary
// airport (used when a participant types the city name).
const ROWS: Row[] = [
  // ── United States ──
  ["JFK", "New York", "John F. Kennedy International", "US", 40.6413, -73.7781, "America/New_York", [1, 25, 30, 30]],
  ["LGA", "New York", "LaGuardia", "US", 40.7769, -73.874, "America/New_York", [1, 26, 30, 30]],
  ["EWR", "Newark", "Newark Liberty International", "US", 40.6895, -74.1745, "America/New_York", [1, 26, 30, 30]],
  ["BOS", "Boston", "Logan International", "US", 42.3656, -71.0096, "America/New_York", [-1, 23, 32, 28]],
  ["PHL", "Philadelphia", "Philadelphia International", "US", 39.8744, -75.2424, "America/New_York", [1, 26, 30, 30]],
  ["DCA", "Washington", "Ronald Reagan Washington National", "US", 38.8521, -77.0377, "America/New_York", [3, 27, 28, 30]],
  ["IAD", "Washington", "Washington Dulles International", "US", 38.9531, -77.4565, "America/New_York", [2, 26, 28, 30]],
  ["BWI", "Baltimore", "Baltimore/Washington International", "US", 39.1754, -76.6684, "America/New_York", [2, 26, 28, 30]],
  ["ATL", "Atlanta", "Hartsfield–Jackson Atlanta International", "US", 33.6407, -84.4277, "America/New_York", [7, 27, 32, 35]],
  ["CLT", "Charlotte", "Charlotte Douglas International", "US", 35.2144, -80.9473, "America/New_York", [6, 27, 30, 35]],
  ["RDU", "Raleigh", "Raleigh–Durham International", "US", 35.8801, -78.788, "America/New_York", [5, 26, 30, 35]],
  ["MIA", "Miami", "Miami International", "US", 25.7959, -80.287, "America/New_York", [20, 29, 15, 50]],
  ["FLL", "Fort Lauderdale", "Fort Lauderdale–Hollywood International", "US", 26.0742, -80.1506, "America/New_York", [20, 29, 15, 50]],
  ["MCO", "Orlando", "Orlando International", "US", 28.4312, -81.3081, "America/New_York", [16, 28, 18, 55]],
  ["TPA", "Tampa", "Tampa International", "US", 27.9755, -82.5332, "America/New_York", [16, 28, 18, 55]],
  ["BNA", "Nashville", "Nashville International", "US", 36.1263, -86.6774, "America/Chicago", [4, 27, 32, 32]],
  ["ORD", "Chicago", "O'Hare International", "US", 41.9742, -87.9073, "America/Chicago", [-4, 24, 28, 30]],
  ["MDW", "Chicago", "Chicago Midway International", "US", 41.7868, -87.7522, "America/Chicago", [-4, 24, 28, 30]],
  ["DTW", "Detroit", "Detroit Metropolitan Wayne County", "US", 42.2124, -83.3534, "America/Detroit", [-4, 23, 32, 28]],
  ["MSP", "Minneapolis", "Minneapolis–Saint Paul International", "US", 44.8848, -93.2223, "America/Chicago", [-9, 23, 22, 30]],
  ["STL", "St. Louis", "St. Louis Lambert International", "US", 38.7499, -90.3748, "America/Chicago", [0, 27, 25, 28]],
  ["MCI", "Kansas City", "Kansas City International", "US", 39.2976, -94.7139, "America/Chicago", [-2, 26, 20, 28]],
  ["CLE", "Cleveland", "Cleveland Hopkins International", "US", 41.4117, -81.8498, "America/New_York", [-2, 23, 38, 30]],
  ["PIT", "Pittsburgh", "Pittsburgh International", "US", 40.4915, -80.2329, "America/New_York", [-2, 23, 38, 32]],
  ["CVG", "Cincinnati", "Cincinnati/Northern Kentucky International", "US", 39.0488, -84.6678, "America/New_York", [0, 25, 32, 30]],
  ["IND", "Indianapolis", "Indianapolis International", "US", 39.7173, -86.2944, "America/Indiana/Indianapolis", [-2, 24, 30, 30]],
  ["CMH", "Columbus", "John Glenn Columbus International", "US", 39.998, -82.8919, "America/New_York", [-1, 24, 32, 30]],
  ["MKE", "Milwaukee", "Milwaukee Mitchell International", "US", 42.9472, -87.8966, "America/Chicago", [-6, 22, 28, 28]],
  ["DFW", "Dallas", "Dallas/Fort Worth International", "US", 32.8998, -97.0403, "America/Chicago", [8, 30, 20, 18]],
  ["DAL", "Dallas", "Dallas Love Field", "US", 32.8471, -96.8518, "America/Chicago", [8, 30, 20, 18]],
  ["IAH", "Houston", "George Bush Intercontinental", "US", 29.9902, -95.3368, "America/Chicago", [12, 29, 25, 32]],
  ["HOU", "Houston", "William P. Hobby", "US", 29.6454, -95.2789, "America/Chicago", [12, 29, 25, 32]],
  ["AUS", "Austin", "Austin–Bergstrom International", "US", 30.1975, -97.6664, "America/Chicago", [10, 30, 20, 18]],
  ["SAT", "San Antonio", "San Antonio International", "US", 29.5337, -98.4698, "America/Chicago", [11, 30, 20, 18]],
  ["MSY", "New Orleans", "Louis Armstrong New Orleans International", "US", 29.9934, -90.258, "America/Chicago", [12, 28, 30, 45]],
  ["DEN", "Denver", "Denver International", "US", 39.8561, -104.6737, "America/Denver", [0, 24, 15, 25]],
  ["SLC", "Salt Lake City", "Salt Lake City International", "US", 40.7899, -111.9791, "America/Denver", [-1, 26, 25, 12]],
  ["PHX", "Phoenix", "Phoenix Sky Harbor International", "US", 33.4373, -112.0078, "America/Phoenix", [13, 35, 10, 15]],
  ["LAS", "Las Vegas", "Harry Reid International", "US", 36.084, -115.1537, "America/Los_Angeles", [9, 33, 8, 8]],
  ["LAX", "Los Angeles", "Los Angeles International", "US", 33.9416, -118.4085, "America/Los_Angeles", [14, 21, 18, 2]],
  ["SAN", "San Diego", "San Diego International", "US", 32.7338, -117.1933, "America/Los_Angeles", [14, 21, 15, 2]],
  ["SFO", "San Francisco", "San Francisco International", "US", 37.6213, -122.379, "America/Los_Angeles", [11, 17, 30, 2]],
  ["SJC", "San Jose", "Norman Y. Mineta San José International", "US", 37.3639, -121.9289, "America/Los_Angeles", [11, 22, 25, 2]],
  ["OAK", "Oakland", "Oakland International", "US", 37.7126, -122.2197, "America/Los_Angeles", [11, 19, 28, 2]],
  ["SMF", "Sacramento", "Sacramento International", "US", 38.6954, -121.5908, "America/Los_Angeles", [8, 24, 28, 1]],
  ["SEA", "Seattle", "Seattle–Tacoma International", "US", 47.4502, -122.3088, "America/Los_Angeles", [5, 19, 55, 10]],
  ["PDX", "Portland", "Portland International", "US", 45.5898, -122.5951, "America/Los_Angeles", [5, 21, 55, 8]],
  ["HNL", "Honolulu", "Daniel K. Inouye International", "US", 21.3187, -157.9224, "Pacific/Honolulu", [23, 27, 25, 20]],
  ["OGG", "Kahului", "Kahului Airport", "US", 20.8986, -156.4305, "Pacific/Honolulu", [23, 27, 25, 18]],
  ["ANC", "Anchorage", "Ted Stevens Anchorage International", "US", 61.1743, -149.9962, "America/Anchorage", [-9, 15, 25, 35]],
  ["SJU", "San Juan", "Luis Muñoz Marín International", "PR", 18.4394, -66.0018, "America/Puerto_Rico", [25, 28, 30, 40]],
  // ── United States: common secondary airports ──
  ["BUF", "Buffalo", "Buffalo Niagara International", "US", 42.9405, -78.7322, "America/New_York", [-4, 22, 40, 30]],
  ["ROC", "Rochester", "Frederick Douglass Greater Rochester International", "US", 43.1189, -77.6724, "America/New_York", [-4, 22, 42, 30]],
  ["SYR", "Syracuse", "Syracuse Hancock International", "US", 43.1112, -76.1063, "America/New_York", [-5, 22, 42, 30]],
  ["ALB", "Albany", "Albany International", "US", 42.7483, -73.8017, "America/New_York", [-4, 23, 35, 32]],
  ["ISP", "Islip", "Long Island MacArthur", "US", 40.7952, -73.1002, "America/New_York", [0, 24, 30, 28]],
  ["HPN", "White Plains", "Westchester County", "US", 41.067, -73.7076, "America/New_York", [-1, 24, 30, 30]],
  ["BDL", "Hartford", "Bradley International", "US", 41.9389, -72.6832, "America/New_York", [-3, 23, 32, 30]],
  ["PVD", "Providence", "Rhode Island T. F. Green International", "US", 41.7267, -71.4325, "America/New_York", [-1, 23, 32, 28]],
  ["BTV", "Burlington", "Burlington International", "US", 44.4719, -73.1533, "America/New_York", [-8, 21, 38, 32]],
  ["PWM", "Portland", "Portland International Jetport", "US", 43.6462, -70.3093, "America/New_York", [-5, 20, 35, 28]],
  ["MHT", "Manchester", "Manchester–Boston Regional", "US", 42.9326, -71.4357, "America/New_York", [-4, 22, 32, 30]],
  ["RIC", "Richmond", "Richmond International", "US", 37.5052, -77.3197, "America/New_York", [3, 26, 28, 32]],
  ["ORF", "Norfolk", "Norfolk International", "US", 36.8946, -76.2012, "America/New_York", [5, 26, 28, 35]],
  ["CHS", "Charleston", "Charleston International", "US", 32.8986, -80.0405, "America/New_York", [9, 28, 28, 42]],
  ["SAV", "Savannah", "Savannah/Hilton Head International", "US", 32.1276, -81.2021, "America/New_York", [10, 28, 28, 42]],
  ["JAX", "Jacksonville", "Jacksonville International", "US", 30.4941, -81.6879, "America/New_York", [12, 28, 25, 45]],
  ["PBI", "West Palm Beach", "Palm Beach International", "US", 26.6832, -80.0956, "America/New_York", [19, 28, 18, 50]],
  ["RSW", "Fort Myers", "Southwest Florida International", "US", 26.5362, -81.7552, "America/New_York", [18, 28, 15, 55]],
  ["SRQ", "Sarasota", "Sarasota–Bradenton International", "US", 27.3954, -82.5544, "America/New_York", [16, 28, 15, 55]],
  ["MYR", "Myrtle Beach", "Myrtle Beach International", "US", 33.6797, -78.9283, "America/New_York", [8, 27, 28, 40]],
  ["GSP", "Greenville", "Greenville–Spartanburg International", "US", 34.8957, -82.2189, "America/New_York", [5, 26, 30, 35]],
  ["TYS", "Knoxville", "McGhee Tyson", "US", 35.811, -83.994, "America/New_York", [4, 26, 32, 35]],
  ["SDF", "Louisville", "Louisville Muhammad Ali International", "US", 38.1744, -85.736, "America/Kentucky/Louisville", [1, 26, 32, 30]],
  ["MEM", "Memphis", "Memphis International", "US", 35.0421, -89.9792, "America/Chicago", [6, 28, 30, 28]],
  ["BHM", "Birmingham", "Birmingham–Shuttlesworth International", "US", 33.5629, -86.7535, "America/Chicago", [7, 27, 32, 35]],
  ["DSM", "Des Moines", "Des Moines International", "US", 41.534, -93.6631, "America/Chicago", [-6, 24, 22, 28]],
  ["OMA", "Omaha", "Eppley Airfield", "US", 41.3032, -95.8941, "America/Chicago", [-5, 25, 18, 28]],
  ["OKC", "Oklahoma City", "Will Rogers World Airport", "US", 35.3931, -97.6007, "America/Chicago", [4, 28, 15, 20]],
  ["TUL", "Tulsa", "Tulsa International", "US", 36.1984, -95.8881, "America/Chicago", [3, 28, 18, 22]],
  ["ELP", "El Paso", "El Paso International", "US", 31.8072, -106.3776, "America/Denver", [8, 29, 8, 20]],
  ["ABQ", "Albuquerque", "Albuquerque International Sunport", "US", 35.0402, -106.6091, "America/Denver", [3, 26, 10, 22]],
  ["TUS", "Tucson", "Tucson International", "US", 32.1161, -110.9410, "America/Phoenix", [12, 31, 12, 25]],
  ["RNO", "Reno", "Reno–Tahoe International", "US", 39.4991, -119.7681, "America/Los_Angeles", [2, 24, 18, 5]],
  ["BOI", "Boise", "Boise Airport", "US", 43.5644, -116.2228, "America/Boise", [-1, 25, 28, 5]],
  ["GEG", "Spokane", "Spokane International", "US", 47.6199, -117.5337, "America/Los_Angeles", [-2, 21, 40, 8]],
  // ── Canada ──
  ["YYZ", "Toronto", "Toronto Pearson International", "CA", 43.6777, -79.6248, "America/Toronto", [-5, 23, 32, 30]],
  ["YVR", "Vancouver", "Vancouver International", "CA", 49.1967, -123.1815, "America/Vancouver", [4, 18, 55, 10]],
  ["YUL", "Montréal", "Montréal–Trudeau International", "CA", 45.4706, -73.7408, "America/Toronto", [-9, 22, 35, 32]],
  ["YYC", "Calgary", "Calgary International", "CA", 51.1215, -114.0076, "America/Edmonton", [-7, 17, 18, 30]],
  // ── Mexico, Caribbean, Central and South America ──
  ["MEX", "Mexico City", "Benito Juárez International", "MX", 19.4363, -99.0721, "America/Mexico_City", [14, 17, 8, 55]],
  ["GDL", "Guadalajara", "Guadalajara International", "MX", 20.5218, -103.3111, "America/Mexico_City", [16, 22, 8, 60]],
  ["CUN", "Cancún", "Cancún International", "MX", 21.0365, -86.8771, "America/Cancun", [23, 29, 25, 40]],
  ["SJO", "San José", "Juan Santamaría International", "CR", 9.9939, -84.2088, "America/Costa_Rica", [20, 22, 10, 55]],
  ["PTY", "Panama City", "Tocumen International", "PA", 9.0714, -79.3835, "America/Panama", [27, 27, 15, 55]],
  ["MBJ", "Montego Bay", "Sangster International", "JM", 18.5037, -77.9134, "America/Jamaica", [25, 28, 20, 35]],
  ["NAS", "Nassau", "Lynden Pindling International", "BS", 25.039, -77.4662, "America/Nassau", [21, 28, 20, 45]],
  ["PUJ", "Punta Cana", "Punta Cana International", "DO", 18.5674, -68.3634, "America/Santo_Domingo", [24, 27, 25, 35]],
  ["BOG", "Bogotá", "El Dorado International", "CO", 4.7016, -74.1469, "America/Bogota", [14, 14, 25, 25]],
  ["LIM", "Lima", "Jorge Chávez International", "PE", -12.0219, -77.1143, "America/Lima", [23, 17, 2, 5]],
  ["GRU", "São Paulo", "São Paulo/Guarulhos International", "BR", -23.4356, -46.4731, "America/Sao_Paulo", [23, 16, 55, 15]],
  ["GIG", "Rio de Janeiro", "Rio de Janeiro/Galeão International", "BR", -22.81, -43.2506, "America/Sao_Paulo", [27, 22, 40, 15]],
  ["EZE", "Buenos Aires", "Ministro Pistarini International", "AR", -34.8222, -58.5358, "America/Argentina/Buenos_Aires", [25, 11, 25, 25]],
  ["SCL", "Santiago", "Arturo Merino Benítez International", "CL", -33.393, -70.7858, "America/Santiago", [21, 9, 2, 25]],
  // ── Europe ──
  ["LHR", "London", "Heathrow", "GB", 51.47, -0.4543, "Europe/London", [5, 19, 40, 25]],
  ["LGW", "London", "Gatwick", "GB", 51.1537, -0.1821, "Europe/London", [4, 18, 40, 25]],
  ["MAN", "Manchester", "Manchester Airport", "GB", 53.3537, -2.275, "Europe/London", [4, 16, 48, 35]],
  ["EDI", "Edinburgh", "Edinburgh Airport", "GB", 55.9508, -3.3615, "Europe/London", [4, 15, 42, 35]],
  ["DUB", "Dublin", "Dublin Airport", "IE", 53.4264, -6.2499, "Europe/Dublin", [5, 16, 45, 35]],
  ["CDG", "Paris", "Charles de Gaulle", "FR", 49.0097, 2.5479, "Europe/Paris", [4, 20, 38, 25]],
  ["ORY", "Paris", "Paris Orly", "FR", 48.7262, 2.3652, "Europe/Paris", [4, 20, 38, 25]],
  ["NCE", "Nice", "Nice Côte d'Azur", "FR", 43.6584, 7.2159, "Europe/Paris", [9, 24, 20, 5]],
  ["AMS", "Amsterdam", "Amsterdam Schiphol", "NL", 52.3105, 4.7683, "Europe/Amsterdam", [4, 18, 45, 30]],
  ["BRU", "Brussels", "Brussels Airport", "BE", 50.901, 4.4856, "Europe/Brussels", [3, 18, 45, 30]],
  ["FRA", "Frankfurt", "Frankfurt Airport", "DE", 50.0379, 8.5622, "Europe/Berlin", [1, 20, 35, 30]],
  ["MUC", "Munich", "Munich Airport", "DE", 48.3538, 11.7861, "Europe/Berlin", [-1, 19, 30, 40]],
  ["BER", "Berlin", "Berlin Brandenburg", "DE", 52.3667, 13.5033, "Europe/Berlin", [0, 19, 32, 28]],
  ["ZRH", "Zürich", "Zurich Airport", "CH", 47.4582, 8.5555, "Europe/Zurich", [0, 19, 30, 40]],
  ["GVA", "Geneva", "Geneva Airport", "CH", 46.2381, 6.109, "Europe/Zurich", [1, 20, 30, 32]],
  ["VIE", "Vienna", "Vienna International", "AT", 48.1103, 16.5697, "Europe/Vienna", [0, 21, 25, 32]],
  ["PRG", "Prague", "Václav Havel Airport Prague", "CZ", 50.1008, 14.2632, "Europe/Prague", [-1, 19, 28, 32]],
  ["WAW", "Warsaw", "Warsaw Chopin", "PL", 52.1657, 20.9671, "Europe/Warsaw", [-2, 19, 28, 32]],
  ["BUD", "Budapest", "Budapest Ferenc Liszt International", "HU", 47.4298, 19.2611, "Europe/Budapest", [0, 22, 25, 28]],
  ["CPH", "Copenhagen", "Copenhagen Airport", "DK", 55.618, 12.6508, "Europe/Copenhagen", [1, 18, 35, 30]],
  ["ARN", "Stockholm", "Stockholm Arlanda", "SE", 59.6498, 17.9238, "Europe/Stockholm", [-3, 18, 32, 30]],
  ["OSL", "Oslo", "Oslo Airport", "NO", 60.1976, 11.1004, "Europe/Oslo", [-5, 17, 35, 35]],
  ["HEL", "Helsinki", "Helsinki-Vantaa", "FI", 60.3183, 24.9497, "Europe/Helsinki", [-5, 17, 35, 30]],
  ["KEF", "Reykjavík", "Keflavík International", "IS", 63.985, -22.6056, "Atlantic/Reykjavik", [0, 11, 55, 40]],
  ["MAD", "Madrid", "Adolfo Suárez Madrid–Barajas", "ES", 40.4983, -3.5676, "Europe/Madrid", [6, 26, 18, 4]],
  ["BCN", "Barcelona", "Josep Tarradellas Barcelona–El Prat", "ES", 41.2974, 2.0833, "Europe/Madrid", [9, 25, 15, 8]],
  ["LIS", "Lisbon", "Humberto Delgado Airport", "PT", 38.7756, -9.1354, "Europe/Lisbon", [11, 23, 32, 2]],
  ["FCO", "Rome", "Leonardo da Vinci–Fiumicino", "IT", 41.8003, 12.2389, "Europe/Rome", [8, 25, 25, 5]],
  ["MXP", "Milan", "Milan Malpensa", "IT", 45.6306, 8.7281, "Europe/Rome", [2, 24, 18, 20]],
  ["VCE", "Venice", "Venice Marco Polo", "IT", 45.5053, 12.3519, "Europe/Rome", [3, 24, 20, 20]],
  ["ATH", "Athens", "Athens International", "GR", 37.9364, 23.9445, "Europe/Athens", [10, 28, 25, 2]],
  ["IST", "Istanbul", "Istanbul Airport", "TR", 41.2753, 28.7519, "Europe/Istanbul", [6, 24, 40, 8]],
  // ── Middle East ──
  ["DXB", "Dubai", "Dubai International", "AE", 25.2532, 55.3657, "Asia/Dubai", [20, 36, 8, 0]],
  ["AUH", "Abu Dhabi", "Zayed International", "AE", 24.433, 54.6511, "Asia/Dubai", [19, 36, 8, 0]],
  ["DOH", "Doha", "Hamad International", "QA", 25.2609, 51.6138, "Asia/Qatar", [18, 36, 8, 0]],
  ["TLV", "Tel Aviv", "Ben Gurion", "IL", 32.0055, 34.8854, "Asia/Jerusalem", [13, 27, 35, 0]],
  ["AMM", "Amman", "Queen Alia International", "JO", 31.7226, 35.9932, "Asia/Amman", [8, 26, 25, 0]],
  // ── Asia ──
  ["HND", "Tokyo", "Tokyo Haneda", "JP", 35.5494, 139.7798, "Asia/Tokyo", [6, 26, 15, 35]],
  ["NRT", "Tokyo", "Narita International", "JP", 35.772, 140.3929, "Asia/Tokyo", [4, 25, 15, 35]],
  ["KIX", "Osaka", "Kansai International", "JP", 34.4347, 135.244, "Asia/Tokyo", [6, 28, 18, 35]],
  ["ICN", "Seoul", "Incheon International", "KR", 37.4602, 126.4407, "Asia/Seoul", [-3, 25, 15, 50]],
  ["PEK", "Beijing", "Beijing Capital International", "CN", 40.0799, 116.6031, "Asia/Shanghai", [-3, 27, 5, 45]],
  ["PVG", "Shanghai", "Shanghai Pudong International", "CN", 31.1443, 121.8083, "Asia/Shanghai", [5, 29, 25, 40]],
  ["HKG", "Hong Kong", "Hong Kong International", "HK", 22.308, 113.9185, "Asia/Hong_Kong", [17, 29, 15, 55]],
  ["TPE", "Taipei", "Taiwan Taoyuan International", "TW", 25.0797, 121.2342, "Asia/Taipei", [16, 29, 35, 40]],
  ["MNL", "Manila", "Ninoy Aquino International", "PH", 14.5086, 121.0194, "Asia/Manila", [26, 28, 15, 60]],
  ["SGN", "Ho Chi Minh City", "Tan Son Nhat International", "VN", 10.8188, 106.652, "Asia/Ho_Chi_Minh", [26, 28, 5, 60]],
  ["BKK", "Bangkok", "Suvarnabhumi", "TH", 13.69, 100.7501, "Asia/Bangkok", [27, 29, 5, 50]],
  ["KUL", "Kuala Lumpur", "Kuala Lumpur International", "MY", 2.7456, 101.7072, "Asia/Kuala_Lumpur", [27, 28, 45, 40]],
  ["SIN", "Singapore", "Singapore Changi", "SG", 1.3644, 103.9915, "Asia/Singapore", [27, 28, 55, 40]],
  ["CGK", "Jakarta", "Soekarno–Hatta International", "ID", -6.1256, 106.6559, "Asia/Jakarta", [27, 28, 65, 15]],
  ["DPS", "Bali", "Ngurah Rai International", "ID", -8.7482, 115.1672, "Asia/Makassar", [27, 26, 60, 10]],
  ["DEL", "Delhi", "Indira Gandhi International", "IN", 28.5562, 77.1, "Asia/Kolkata", [14, 31, 8, 55]],
  ["BOM", "Mumbai", "Chhatrapati Shivaji Maharaj International", "IN", 19.0896, 72.8656, "Asia/Kolkata", [24, 28, 1, 85]],
  ["BLR", "Bengaluru", "Kempegowda International", "IN", 13.1989, 77.7068, "Asia/Kolkata", [22, 24, 2, 40]],
  ["HYD", "Hyderabad", "Rajiv Gandhi International", "IN", 17.2403, 78.4294, "Asia/Kolkata", [22, 27, 2, 45]],
  ["MAA", "Chennai", "Chennai International", "IN", 12.9941, 80.1709, "Asia/Kolkata", [25, 31, 10, 30]],
  ["CCU", "Kolkata", "Netaji Subhas Chandra Bose International", "IN", 22.6547, 88.4467, "Asia/Kolkata", [20, 29, 5, 65]],
  ["AMD", "Ahmedabad", "Sardar Vallabhbhai Patel International", "IN", 23.0772, 72.6347, "Asia/Kolkata", [20, 29, 1, 55]],
  ["LHE", "Lahore", "Allama Iqbal International", "PK", 31.5216, 74.4036, "Asia/Karachi", [12, 32, 10, 40]],
  ["KHI", "Karachi", "Jinnah International", "PK", 24.9065, 67.1608, "Asia/Karachi", [19, 31, 3, 25]],
  ["DAC", "Dhaka", "Hazrat Shahjalal International", "BD", 23.8433, 90.3978, "Asia/Dhaka", [19, 29, 3, 70]],
  ["CMB", "Colombo", "Bandaranaike International", "LK", 7.1808, 79.8841, "Asia/Colombo", [27, 28, 25, 45]],
  ["KTM", "Kathmandu", "Tribhuvan International", "NP", 27.6966, 85.3591, "Asia/Kathmandu", [10, 24, 5, 70]],
  ["CAN", "Guangzhou", "Guangzhou Baiyun International", "CN", 23.3924, 113.2988, "Asia/Shanghai", [14, 29, 20, 55]],
  ["SZX", "Shenzhen", "Shenzhen Bao'an International", "CN", 22.6393, 113.8107, "Asia/Shanghai", [16, 29, 18, 55]],
  ["CTU", "Chengdu", "Chengdu Tianfu International", "CN", 30.3125, 104.4414, "Asia/Shanghai", [6, 26, 20, 50]],
  ["HAN", "Hanoi", "Noi Bai International", "VN", 21.2212, 105.8072, "Asia/Ho_Chi_Minh", [17, 29, 20, 60]],
  ["PUS", "Busan", "Gimhae International", "KR", 35.1795, 128.9382, "Asia/Seoul", [3, 25, 12, 45]],
  // ── Oceania ──
  ["SYD", "Sydney", "Sydney Kingsford Smith", "AU", -33.9399, 151.1753, "Australia/Sydney", [23, 13, 35, 25]],
  ["MEL", "Melbourne", "Melbourne Airport", "AU", -37.669, 144.841, "Australia/Melbourne", [21, 10, 20, 35]],
  ["BNE", "Brisbane", "Brisbane Airport", "AU", -27.3842, 153.1175, "Australia/Brisbane", [25, 16, 40, 15]],
  ["PER", "Perth", "Perth Airport", "AU", -31.9385, 115.9672, "Australia/Perth", [25, 13, 5, 45]],
  ["AKL", "Auckland", "Auckland Airport", "NZ", -37.0082, 174.785, "Pacific/Auckland", [20, 11, 25, 45]],
  // ── Africa ──
  ["JNB", "Johannesburg", "O. R. Tambo International", "ZA", -26.1367, 28.2411, "Africa/Johannesburg", [21, 11, 45, 2]],
  ["CPT", "Cape Town", "Cape Town International", "ZA", -33.9715, 18.6021, "Africa/Johannesburg", [21, 13, 5, 40]],
  ["CAI", "Cairo", "Cairo International", "EG", 30.1219, 31.4056, "Africa/Cairo", [14, 29, 5, 0]],
  ["ADD", "Addis Ababa", "Addis Ababa Bole International", "ET", 8.9779, 38.7993, "Africa/Addis_Ababa", [16, 16, 5, 75]],
  ["NBO", "Nairobi", "Jomo Kenyatta International", "KE", -1.3192, 36.9278, "Africa/Nairobi", [20, 17, 15, 10]],
  ["LOS", "Lagos", "Murtala Muhammed International", "NG", 6.5774, 3.3212, "Africa/Lagos", [27, 26, 5, 55]],
  ["ACC", "Accra", "Kotoka International", "GH", 5.6052, -0.1668, "Africa/Accra", [28, 26, 5, 30]],
  ["CMN", "Casablanca", "Mohammed V International", "MA", 33.3675, -7.5898, "Africa/Casablanca", [13, 23, 25, 1]],
  ["RAK", "Marrakesh", "Marrakesh Menara", "MA", 31.6069, -8.0363, "Africa/Casablanca", [12, 29, 15, 1]],
];

export const AIRPORTS: readonly Airport[] = ROWS.map(([code, city, name, country, lat, lon, tz]) => ({
  code,
  city,
  name,
  country,
  lat,
  lon,
  tz,
  known: true,
}));

/** Codes shown as quick picks in flight setup, most popular first. */
export const POPULAR_AIRPORT_CODES: readonly string[] = [
  "JFK",
  "LGA",
  "EWR",
  "LAX",
  "SFO",
  "ORD",
  "BOS",
  "MIA",
  "ATL",
  "SEA",
  "LHR",
  "CDG",
];

/** Extra ways people type a city; all map to the airport code. */
const ALIASES: Record<string, string[]> = {
  JFK: ["nyc", "new york city", "manhattan", "kennedy"],
  LGA: ["new york city", "laguardia"],
  EWR: ["new york", "new york city", "nyc"],
  DCA: ["washington dc", "washington d.c.", "dc", "reagan national"],
  IAD: ["washington dc", "dulles"],
  BWI: ["washington dc"],
  SFO: ["sf", "san fran"],
  LAX: ["la"],
  LAS: ["vegas"],
  PHL: ["philly"],
  MSY: ["nola"],
  FLL: ["ft lauderdale", "ft. lauderdale"],
  STL: ["saint louis", "st louis"],
  SLC: ["salt lake"],
  MSP: ["st paul", "saint paul", "minneapolis st paul"],
  OGG: ["maui"],
  HNL: ["oahu", "hawaii"],
  SJU: ["puerto rico"],
  YUL: ["montreal"],
  CUN: ["cancun"],
  SJO: ["costa rica"],
  PTY: ["panama"],
  MBJ: ["jamaica"],
  NAS: ["bahamas"],
  GRU: ["sao paulo"],
  GIG: ["rio"],
  BOG: ["bogota"],
  MEX: ["cdmx", "ciudad de mexico"],
  LHR: ["heathrow"],
  LGW: ["gatwick"],
  ZRH: ["zurich"],
  MUC: ["munchen", "münchen"],
  VIE: ["wien"],
  PRG: ["praha"],
  LIS: ["lisboa"],
  FCO: ["roma"],
  MXP: ["milano"],
  VCE: ["venezia"],
  CPH: ["kobenhavn"],
  KEF: ["reykjavik", "iceland"],
  HND: ["haneda"],
  NRT: ["narita"],
  PEK: ["peking"],
  SGN: ["saigon", "ho chi minh"],
  BOM: ["bombay"],
  MAA: ["madras"],
  CCU: ["calcutta"],
  CAN: ["canton"],
  PBI: ["palm beach"],
  RSW: ["ft myers", "ft. myers"],
  MHT: ["manchester nh", "manchester new hampshire"],
  PWM: ["portland maine", "portland me"],
  BLR: ["bangalore"],
  DEL: ["new delhi"],
  DPS: ["denpasar", "bali"],
  CGK: ["jakarta"],
  JNB: ["joburg", "jo'burg"],
  ADD: ["addis"],
  RAK: ["marrakech"],
  CMN: ["casa"],
  AMS: ["schiphol"],
  ORD: ["ohare", "o'hare"],
  BOS: ["logan"],
  MDW: ["midway"],
  SIN: ["changi"],
};

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  PR: "Puerto Rico",
  CA: "Canada",
  MX: "Mexico",
  CR: "Costa Rica",
  PA: "Panama",
  JM: "Jamaica",
  BS: "Bahamas",
  DO: "Dominican Republic",
  CO: "Colombia",
  PE: "Peru",
  BR: "Brazil",
  AR: "Argentina",
  CL: "Chile",
  GB: "United Kingdom",
  IE: "Ireland",
  FR: "France",
  NL: "Netherlands",
  BE: "Belgium",
  DE: "Germany",
  CH: "Switzerland",
  AT: "Austria",
  CZ: "Czechia",
  PL: "Poland",
  HU: "Hungary",
  DK: "Denmark",
  SE: "Sweden",
  NO: "Norway",
  FI: "Finland",
  IS: "Iceland",
  ES: "Spain",
  PT: "Portugal",
  IT: "Italy",
  GR: "Greece",
  TR: "Turkey",
  AE: "United Arab Emirates",
  QA: "Qatar",
  IL: "Israel",
  JO: "Jordan",
  JP: "Japan",
  KR: "South Korea",
  CN: "China",
  HK: "Hong Kong",
  TW: "Taiwan",
  PH: "Philippines",
  VN: "Vietnam",
  TH: "Thailand",
  MY: "Malaysia",
  SG: "Singapore",
  ID: "Indonesia",
  IN: "India",
  PK: "Pakistan",
  BD: "Bangladesh",
  LK: "Sri Lanka",
  NP: "Nepal",
  AU: "Australia",
  NZ: "New Zealand",
  ZA: "South Africa",
  EG: "Egypt",
  ET: "Ethiopia",
  KE: "Kenya",
  NG: "Nigeria",
  GH: "Ghana",
  MA: "Morocco",
};


/** US state (or Canadian province) of each North American catalog airport, for "City, State" input. */
const AIRPORT_STATE: Record<string, string> = {
  JFK: "NY", LGA: "NY", EWR: "NJ", BOS: "MA", PHL: "PA", DCA: "DC", IAD: "VA", BWI: "MD", ATL: "GA", CLT: "NC", RDU: "NC",
  MIA: "FL", FLL: "FL", MCO: "FL", TPA: "FL", BNA: "TN", ORD: "IL", MDW: "IL", DTW: "MI", MSP: "MN", STL: "MO", MCI: "MO",
  CLE: "OH", PIT: "PA", CVG: "KY", IND: "IN", CMH: "OH", MKE: "WI", DFW: "TX", DAL: "TX", IAH: "TX", HOU: "TX", AUS: "TX",
  SAT: "TX", MSY: "LA", DEN: "CO", SLC: "UT", PHX: "AZ", LAS: "NV", LAX: "CA", SAN: "CA", SFO: "CA", SJC: "CA", OAK: "CA",
  SMF: "CA", SEA: "WA", PDX: "OR", HNL: "HI", OGG: "HI", ANC: "AK", SJU: "PR",
  BUF: "NY", ROC: "NY", SYR: "NY", ALB: "NY", ISP: "NY", HPN: "NY", BDL: "CT", PVD: "RI", BTV: "VT", PWM: "ME", MHT: "NH",
  RIC: "VA", ORF: "VA", CHS: "SC", SAV: "GA", JAX: "FL", PBI: "FL", RSW: "FL", SRQ: "FL", MYR: "SC", GSP: "SC", TYS: "TN",
  SDF: "KY", MEM: "TN", BHM: "AL", DSM: "IA", OMA: "NE", OKC: "OK", TUL: "OK", ELP: "TX", ABQ: "NM", TUS: "AZ", RNO: "NV",
  BOI: "ID", GEG: "WA",
  YYZ: "ON", YVR: "BC", YUL: "QC", YYC: "AB",
};

/** State / province names and abbreviations (as search keys) → abbreviation. */
const STATE_KEYS: Record<string, string> = {};
for (const [abbr, name] of [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"],
  ["CT", "Connecticut"], ["DE", "Delaware"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"],
  ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"],
  ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"],
  ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"],
  ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"],
  ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"],
  ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"],
  ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"], ["DC", "District of Columbia"], ["PR", "Puerto Rico"],
  ["ON", "Ontario"], ["BC", "British Columbia"], ["QC", "Quebec"], ["AB", "Alberta"], ["MB", "Manitoba"], ["SK", "Saskatchewan"],
  ["NS", "Nova Scotia"], ["NB", "New Brunswick"], ["NL", "Newfoundland"],
] as const) {
  STATE_KEYS[abbr.toLowerCase()] = abbr;
  STATE_KEYS[searchKey(name)] = abbr;
}

/** Extra ways people write a country after a comma. */
const COUNTRY_ALIASES: Record<string, string> = {
  usa: "US", us: "US", "united states of america": "US", america: "US", uk: "GB", england: "GB", scotland: "GB", britain: "GB",
  "great britain": "GB", holland: "NL", uae: "AE", "czech republic": "CZ", "south korea": "KR", korea: "KR", "hong kong": "HK",
};

export function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}

/** Lowercase ASCII key: strips diacritics and punctuation, collapses spaces. */
export function searchKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,'’]/g, "")
    .replace(/[-–/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Country name search keys and ISO codes → ISO code, for "City, Country" input. */
const COUNTRY_KEYS: Record<string, string> = { ...COUNTRY_ALIASES };
for (const [code, name] of Object.entries(COUNTRY_NAMES)) {
  COUNTRY_KEYS[searchKey(name)] = code;
  COUNTRY_KEYS[code.toLowerCase()] = code;
}

const GENERIC_NAME_WORDS = new Set(["international", "airport", "the", "de", "da", "del", "of"]);

interface Indexed {
  airport: Airport;
  index: number;
  codeKey: string;
  cityKey: string;
  nameKey: string;
  nameWords: string[];
  aliases: string[];
  countryKey: string;
  popularity: number;
}

const INDEX: Indexed[] = AIRPORTS.map((airport, index) => {
  const nameKey = searchKey(airport.name);
  const pop = POPULAR_AIRPORT_CODES.indexOf(airport.code);
  return {
    airport,
    index,
    codeKey: airport.code.toLowerCase(),
    cityKey: searchKey(airport.city),
    nameKey,
    nameWords: nameKey.split(" ").filter((w) => w.length > 0 && !GENERIC_NAME_WORDS.has(w)),
    aliases: (ALIASES[airport.code] ?? []).map(searchKey),
    countryKey: searchKey(countryName(airport.country)),
    popularity: pop === -1 ? 999 : pop,
  };
});

const BY_CODE = new Map(INDEX.map((e) => [e.airport.code, e.airport]));

const CLIMATE = new Map(ROWS.map((r) => [r[0], r[7]]));

/** Approximate climate normals for a known airport (undefined for synthetic ones). */
export function climateFor(code: string): { janC: number; julC: number; rainJanPct: number; rainJulPct: number } | undefined {
  const c = CLIMATE.get(code.toUpperCase());
  return c ? { janC: c[0], julC: c[1], rainJanPct: c[2], rainJulPct: c[3] } : undefined;
}

/** Exact IATA code lookup (case-insensitive). */
export function getAirport(code: string): Airport | undefined {
  return BY_CODE.get(code.trim().toUpperCase());
}

function rankFor(entry: Indexed, q: string): number {
  // A typed city beats an accidental code match: "los" is Los Angeles before Lagos (LOS),
  // "lo" is London and Los Angeles before Lagos. Popularity breaks the ties.
  const cityPrefix = entry.cityKey.startsWith(q) || entry.aliases.some((a) => a.startsWith(q));
  if (entry.codeKey === q || (cityPrefix && q.length >= 3)) return 0;
  if (entry.codeKey.startsWith(q) || cityPrefix) return 1;
  if (entry.cityKey.split(" ").some((w) => w.startsWith(q)) || entry.nameWords.some((w) => w.startsWith(q))) return 3;
  if (entry.cityKey.includes(q) || entry.nameKey.includes(q) || entry.countryKey.startsWith(q)) return 4;
  return -1;
}

/**
 * Ranked search over code, city, name and country: exact code, code prefix,
 * city prefix, name-word prefix, then substring. Case- and
 * diacritics-insensitive. Empty query → popular airports.
 */
export function searchAirports(query: string, limit = 8): Airport[] {
  const q = searchKey(query);
  if (!q) {
    return POPULAR_AIRPORT_CODES.map((code) => BY_CODE.get(code))
      .filter((a): a is Airport => Boolean(a))
      .slice(0, limit);
  }
  const ranked: Array<{ entry: Indexed; rank: number }> = [];
  for (const entry of INDEX) {
    const rank = rankFor(entry, q);
    if (rank >= 0) ranked.push({ entry, rank });
  }
  ranked.sort(
    (a, b) =>
      a.rank - b.rank || a.entry.popularity - b.entry.popularity || a.entry.index - b.entry.index,
  );
  return ranked.slice(0, limit).map((r) => r.entry.airport);
}

/** The primary airport for a typed city name or alias (first listed wins). */
function airportForCity(key: string): Airport | undefined {
  if (!key) return undefined;
  const byCity = INDEX.find((e) => e.cityKey === key || e.aliases.includes(key));
  if (byCity) return byCity.airport;
  // A distinctive airport name ("Heathrow", "Changi", "Logan"), or a whole name.
  const byName = INDEX.filter(
    (e) => e.nameKey === key || (key.length >= 5 && e.nameWords.includes(key)),
  );
  return byName.length === 1 ? byName[0].airport : undefined;
}

const SMALL_WORDS = new Set(["of", "de", "del", "la", "le", "da", "do", "dos", "das", "and", "on", "the", "upon"]);
const FORCE_UPPER = new Set(["dc", "nyc", "la", "sf", "uk", "usa"]);

/** "san luis obispo" → "San Luis Obispo", "washington dc" → "Washington DC". */
export function titleCase(text: string): string {
  const words = text.trim().replace(/\s+/g, " ").split(" ");
  return words
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (i > 0 && SMALL_WORDS.has(lower)) return lower;
      if (FORCE_UPPER.has(lower)) return lower.toUpperCase();
      return lower
        .split(/([-'’])/)
        .map((part) => (part.length > 0 && !/[-'’]/.test(part) ? part[0].toUpperCase() + part.slice(1) : part))
        .join("");
    })
    .join(" ");
}

/** Well-known real codes missing from the catalog: a synthetic airport must not borrow them. */
const RESERVED_CODES = new Set([
  "BUR", "JAC", "CHA", "HAR", "PEN", "GUA", "FLO", "LOU", "TAL", "BEL", "MAR", "MOS", "RIG", "PRO", "GRE", "SPO", "BIR",
  "FOR", "LIT", "SAC", "AUG", "GRR", "MSN", "DAY", "LEX", "ICT", "COS", "SNA", "ONT", "PSP", "LGB", "SBA", "FAT", "EUG",
  "MDT", "AVP", "ROA", "GSO", "ILM", "PNS", "TLH", "GNV", "MLB", "DAB", "VPS", "HSV", "MOB", "JAN", "LBB", "AMA", "MAF",
  "CRP", "BRO", "MTY", "SJD", "PVR", "LIR", "SAL", "SDQ", "STI", "KIN", "AUA", "CUR", "BGI", "UVF", "POS", "GCM", "BDA",
  "YOW", "YHZ", "YEG", "YWG", "YQB", "SXM", "ANU", "STT", "STX",
]);

function syntheticCode(city: string, preferred?: string): string {
  if (preferred && /^[A-Za-z]{3}$/.test(preferred)) return preferred.toUpperCase();
  const letters = searchKey(city).replace(/[^a-z]/g, "").toUpperCase();
  const consonants = letters.slice(1).replace(/[AEIOU]/g, "");
  const candidates = [letters.slice(0, 3), letters[0] + consonants.slice(0, 2), letters.slice(0, 2) + "X", letters[0] + "XX"];
  for (const c of candidates) {
    const code = (c || "").padEnd(3, "X").slice(0, 3);
    if (code.length === 3 && !BY_CODE.has(code) && !RESERVED_CODES.has(code)) return code;
  }
  return "XXX";
}

/**
 * A plausible airport for free text that matched nothing. Deterministic:
 * coordinates come from a hash of the text. The flight generator replaces the
 * time zone, country and coordinates with ones that fit the other endpoint.
 */
export function syntheticAirport(text: string, preferredCode?: string): Airport {
  const cleaned = text.trim().replace(/\s+/g, " ");
  const city = cleaned ? titleCase(cleaned) : "Unknown";
  const [h1, h2] = hashString(searchKey(city));
  return {
    code: syntheticCode(city, preferredCode),
    city,
    name: `${city} Airport`,
    country: "US",
    lat: Math.round((27 + (h1 % 2000) / 100) * 1000) / 1000,
    lon: Math.round((-122 + (h2 % 5000) / 100) * 1000) / 1000,
    tz: "America/New_York",
    known: false,
  };
}

/**
 * Resolve a FlightInput origin/destination value to an Airport: a known
 * airport by code, "City (ABC)", a city name or alias, otherwise a
 * deterministic synthetic airport (known: false). Never throws.
 */
export function resolveAirport(value: string): Airport {
  const raw = (value ?? "").trim();
  if (!raw) return syntheticAirport("");

  const paren = /^(.*?)\s*\(([A-Za-z]{3})\)\s*$/.exec(raw);
  if (paren) {
    const known = getAirport(paren[2]);
    if (known) return known;
    const cityText = paren[1].trim() || paren[2].toUpperCase();
    return syntheticAirport(cityText, paren[2]);
  }

  if (/^[A-Za-z]{3}$/.test(raw)) {
    const known = getAirport(raw);
    if (known) return known;
  }

  const key = searchKey(raw);
  const byCity = airportForCity(key);
  if (byCity) return byCity;

  // "Denver, CO" / "San Jose, Costa Rica": the part after the comma must agree with the city.
  const comma = raw.indexOf(",");
  if (comma > 0) {
    const beforeComma = raw.slice(0, comma).trim();
    const suffix = searchKey(raw.slice(comma + 1));
    const cityKey = searchKey(beforeComma);
    const candidates = INDEX.filter((e) => e.cityKey === cityKey || e.aliases.includes(cityKey)).map((e) => e.airport);
    const state = STATE_KEYS[suffix];
    const country = COUNTRY_KEYS[suffix];
    if (state) {
      const match = candidates.find((a) => AIRPORT_STATE[a.code] === state);
      if (match) return match;
      return syntheticAirport(beforeComma);
    }
    if (country) {
      const match = candidates.find((a) => a.country === country || (country === "US" && a.country === "PR"));
      if (match) return match;
      // "Paris, Texas" style mismatches are caught above; an unknown city in a known country stays synthetic.
      return syntheticAirport(beforeComma);
    }
    const byPrefix = candidates[0] ?? airportForCity(cityKey);
    if (byPrefix) return byPrefix;
    return syntheticAirport(beforeComma || raw);
  }

  return syntheticAirport(raw);
}
