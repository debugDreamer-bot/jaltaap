// MOCK DATA for local development only (VITE_USE_MOCK=true). Values are made up so the UI
// can be exercised without the backend. They are shown under a "MOCK DATA" banner.
import type {
  BriefResponse,
  City,
  NowResponse,
  CrewSchedule,
  WaterIssue,
  FloodResponse,
  HeatResponse,
  Hotspot,
  OfficerReport,
  ReliefPoint,
  ReplayScenario,
  ScenarioSummary,
} from '../api/types'
import type { FloodLevel, HeatBand } from '../theme'

const LATS = [28.4, 28.5, 28.6, 28.7, 28.8, 28.9]
const LONS = [76.8, 76.9, 77.0, 77.1, 77.2, 77.3]

// City list and grids copied from data/cities.json (pan-India coverage); weather below is made up.
export const CITY_GRIDS: Array<City & { _lats: number[]; _lons: number[] }> = [{"id": "delhi", "name": "Delhi", "name_hi": "दिल्ली", "state": "Delhi", "lat": 28.6214, "lon": 77.2148, "tier": "full", "agencies": {"civic": "MCD", "water": "DJB"}, "agency_names": {"DJB": "Delhi Jal Board", "MCD": "Municipal Corporation of Delhi"}, "bounds": [76.75, 28.35, 77.35, 28.95], "_lats": [28.4, 28.5, 28.6, 28.7, 28.8, 28.9], "_lons": [76.8, 76.9, 77.0, 77.1, 77.2, 77.3]}, {"id": "mumbai", "name": "Mumbai", "name_hi": "मुंबई", "state": "Maharashtra", "lat": 19.0728, "lon": 72.8826, "tier": "heat_and_rain", "agencies": {"civic": "BMC", "water": "BMC"}, "agency_names": {"BMC": "Brihanmumbai Municipal Corporation"}, "bounds": [72.75, 18.95, 73.05, 19.25], "_lats": [19.0, 19.1, 19.2], "_lons": [72.8, 72.9, 73.0]}, {"id": "kolkata", "name": "Kolkata", "name_hi": "कोलकाता", "state": "West Bengal", "lat": 22.5626, "lon": 88.363, "tier": "heat_and_rain", "agencies": {"civic": "KMC", "water": "KMC"}, "agency_names": {"KMC": "Kolkata Municipal Corporation"}, "bounds": [88.25, 22.45, 88.55, 22.75], "_lats": [22.5, 22.6, 22.7], "_lons": [88.3, 88.4, 88.5]}, {"id": "chennai", "name": "Chennai", "name_hi": "चेन्नई", "state": "Tamil Nadu", "lat": 13.0878, "lon": 80.2785, "tier": "heat_and_rain", "agencies": {"civic": "GCC", "water": "CMWSSB"}, "agency_names": {"CMWSSB": "Chennai Metrowater (CMWSSB)", "GCC": "Greater Chennai Corporation"}, "bounds": [80.05, 12.95, 80.35, 13.25], "_lats": [13.0, 13.1, 13.2], "_lons": [80.1, 80.2, 80.3]}, {"id": "bengaluru", "name": "Bengaluru", "name_hi": "बेंगलुरु", "state": "Karnataka", "lat": 12.9719, "lon": 77.5937, "tier": "heat_and_rain", "agencies": {"civic": "GBA", "water": "BWSSB"}, "agency_names": {"BWSSB": "Bangalore Water Supply and Sewerage Board", "GBA": "Greater Bengaluru Authority"}, "bounds": [77.45, 12.85, 77.75, 13.15], "_lats": [12.9, 13.0, 13.1], "_lons": [77.5, 77.6, 77.7]}, {"id": "hyderabad", "name": "Hyderabad", "name_hi": "हैदराबाद", "state": "Telangana", "lat": 17.384, "lon": 78.4564, "tier": "heat_and_rain", "agencies": {"civic": "GHMC", "water": "HMWSSB"}, "agency_names": {"HMWSSB": "Hyderabad Metropolitan Water Supply and Sewerage Board", "GHMC": "Greater Hyderabad Municipal Corporation"}, "bounds": [78.35, 17.25, 78.65, 17.55], "_lats": [17.3, 17.4, 17.5], "_lons": [78.4, 78.5, 78.6]}, {"id": "ahmedabad", "name": "Ahmedabad", "name_hi": "अहमदाबाद", "state": "Gujarat", "lat": 23.0258, "lon": 72.5873, "tier": "heat_and_rain", "agencies": {"civic": "AMC", "water": "AMC"}, "agency_names": {"AMC": "Ahmedabad Municipal Corporation"}, "bounds": [72.45, 22.85, 72.75, 23.15], "_lats": [22.9, 23.0, 23.1], "_lons": [72.5, 72.6, 72.7]}, {"id": "lucknow", "name": "Lucknow", "name_hi": "लखनऊ", "state": "Uttar Pradesh", "lat": 26.8393, "lon": 80.9231, "tier": "heat_and_rain", "agencies": {"civic": "LMC", "water": "LMC"}, "agency_names": {"LMC": "Lucknow Municipal Corporation"}, "bounds": [80.75, 26.65, 81.05, 26.95], "_lats": [26.7, 26.8, 26.9], "_lons": [80.8, 80.9, 81.0]}, {"id": "jaipur", "name": "Jaipur", "name_hi": "जयपुर", "state": "Rajasthan", "lat": 26.9196, "lon": 75.7878, "tier": "heat_and_rain", "agencies": {"civic": "JMC", "water": "PHED"}, "agency_names": {"PHED": "Public Health Engineering Department Rajasthan", "JMC": "Jaipur Municipal Corporation"}, "bounds": [75.65, 26.75, 75.95, 27.05], "_lats": [26.8, 26.9, 27.0], "_lons": [75.7, 75.8, 75.9]}, {"id": "patna", "name": "Patna", "name_hi": "पटना", "state": "Bihar", "lat": 25.5941, "lon": 85.1356, "tier": "heat_and_rain", "agencies": {"civic": "PMC", "water": "PMC"}, "agency_names": {"PMC": "Patna Municipal Corporation"}, "bounds": [84.95, 25.45, 85.25, 25.75], "_lats": [25.5, 25.6, 25.7], "_lons": [85.0, 85.1, 85.2]}, {"id": "nagpur", "name": "Nagpur", "name_hi": "नागपुर", "state": "Maharashtra", "lat": 21.1463, "lon": 79.0849, "tier": "heat_and_rain", "agencies": {"civic": "NMC", "water": "NMC"}, "agency_names": {"NMC": "Nagpur Municipal Corporation"}, "bounds": [78.95, 20.95, 79.25, 21.25], "_lats": [21.0, 21.1, 21.2], "_lons": [79.0, 79.1, 79.2]}, {"id": "pune", "name": "Pune", "name_hi": "पुणे", "state": "Maharashtra", "lat": 18.5196, "lon": 73.8554, "tier": "city", "agencies": {"civic": "PUNE_MC", "water": "PUNE_MC"}, "agency_names": {"PUNE_MC": "Pune Municipal Corporation"}, "bounds": [73.85, 18.45, 73.95, 18.55], "_lats": [18.5], "_lons": [73.9]}, {"id": "surat", "name": "Surat", "name_hi": "सूरत", "state": "Gujarat", "lat": 21.1959, "lon": 72.8302, "tier": "city", "agencies": {"civic": "SURAT_MC", "water": "SURAT_MC"}, "agency_names": {"SURAT_MC": "Surat Municipal Corporation"}, "bounds": [72.75, 21.15, 72.85, 21.25], "_lats": [21.2], "_lons": [72.8]}, {"id": "kanpur", "name": "Kanpur", "name_hi": "कानपुर", "state": "Uttar Pradesh", "lat": 26.4652, "lon": 80.3498, "tier": "city", "agencies": {"civic": "KANPUR_NN", "water": "KANPUR_NN"}, "agency_names": {"KANPUR_NN": "Kanpur Nagar Nigam"}, "bounds": [80.25, 26.45, 80.35, 26.55], "_lats": [26.5], "_lons": [80.3]}, {"id": "indore", "name": "Indore", "name_hi": "इंदौर", "state": "Madhya Pradesh", "lat": 22.7179, "lon": 75.8333, "tier": "city", "agencies": {"civic": "INDORE_MC", "water": "INDORE_MC"}, "agency_names": {"INDORE_MC": "Indore Municipal Corporation"}, "bounds": [75.75, 22.65, 75.85, 22.75], "_lats": [22.7], "_lons": [75.8]}, {"id": "bhopal", "name": "Bhopal", "name_hi": "भोपाल", "state": "Madhya Pradesh", "lat": 23.2547, "lon": 77.4029, "tier": "city", "agencies": {"civic": "BHOPAL_MC", "water": "BHOPAL_MC"}, "agency_names": {"BHOPAL_MC": "Bhopal Municipal Corporation"}, "bounds": [77.35, 23.25, 77.45, 23.35], "_lats": [23.3], "_lons": [77.4]}, {"id": "visakhapatnam", "name": "Visakhapatnam", "name_hi": "विशाखापत्तनम", "state": "Andhra Pradesh", "lat": 17.6801, "lon": 83.2016, "tier": "city", "agencies": {"civic": "GVMC", "water": "GVMC"}, "agency_names": {"GVMC": "Greater Visakhapatnam Municipal Corporation"}, "bounds": [83.15, 17.65, 83.25, 17.75], "_lats": [17.7], "_lons": [83.2]}, {"id": "vadodara", "name": "Vadodara", "name_hi": "वडोदरा", "state": "Gujarat", "lat": 22.2994, "lon": 73.2081, "tier": "city", "agencies": {"civic": "VADODARA_MC", "water": "VADODARA_MC"}, "agency_names": {"VADODARA_MC": "Vadodara Municipal Corporation"}, "bounds": [73.15, 22.25, 73.25, 22.35], "_lats": [22.3], "_lons": [73.2]}, {"id": "ludhiana", "name": "Ludhiana", "name_hi": "लुधियाना", "state": "Punjab", "lat": 30.912, "lon": 75.8538, "tier": "city", "agencies": {"civic": "LUDHIANA_MC", "water": "LUDHIANA_MC"}, "agency_names": {"LUDHIANA_MC": "Ludhiana Municipal Corporation"}, "bounds": [75.85, 30.85, 75.95, 30.95], "_lats": [30.9], "_lons": [75.9]}, {"id": "agra", "name": "Agra", "name_hi": "आगरा", "state": "Uttar Pradesh", "lat": 27.1833, "lon": 78.0167, "tier": "city", "agencies": {"civic": "AGRA_NN", "water": "AGRA_NN"}, "agency_names": {"AGRA_NN": "Agra Nagar Nigam"}, "bounds": [77.95, 27.15, 78.05, 27.25], "_lats": [27.2], "_lons": [78.0]}, {"id": "nashik", "name": "Nashik", "name_hi": "नासिक", "state": "Maharashtra", "lat": 19.9973, "lon": 73.791, "tier": "city", "agencies": {"civic": "NASHIK_MC", "water": "NASHIK_MC"}, "agency_names": {"NASHIK_MC": "Nashik Municipal Corporation"}, "bounds": [73.75, 19.95, 73.85, 20.05], "_lats": [20.0], "_lons": [73.8]}, {"id": "varanasi", "name": "Varanasi", "name_hi": "वाराणसी", "state": "Uttar Pradesh", "lat": 25.3167, "lon": 83.0104, "tier": "city", "agencies": {"civic": "VARANASI_NN", "water": "VARANASI_NN"}, "agency_names": {"VARANASI_NN": "Varanasi Nagar Nigam"}, "bounds": [82.95, 25.25, 83.05, 25.35], "_lats": [25.3], "_lons": [83.0]}, {"id": "meerut", "name": "Meerut", "name_hi": "मेरठ", "state": "Uttar Pradesh", "lat": 28.98, "lon": 77.7064, "tier": "city", "agencies": {"civic": "MEERUT_NN", "water": "MEERUT_NN"}, "agency_names": {"MEERUT_NN": "Meerut Nagar Nigam"}, "bounds": [77.65, 28.95, 77.75, 29.05], "_lats": [29.0], "_lons": [77.7]}, {"id": "rajkot", "name": "Rajkot", "name_hi": "राजकोट", "state": "Gujarat", "lat": 22.2916, "lon": 70.7932, "tier": "city", "agencies": {"civic": "RAJKOT_MC", "water": "RAJKOT_MC"}, "agency_names": {"RAJKOT_MC": "Rajkot Municipal Corporation"}, "bounds": [70.75, 22.25, 70.85, 22.35], "_lats": [22.3], "_lons": [70.8]}, {"id": "srinagar", "name": "Srinagar", "name_hi": "श्रीनगर", "state": "Jammu and Kashmir", "lat": 34.0857, "lon": 74.8055, "tier": "city", "agencies": {"civic": "SRINAGAR_MC", "water": "SRINAGAR_MC"}, "agency_names": {"SRINAGAR_MC": "Srinagar Municipal Corporation"}, "bounds": [74.75, 34.05, 74.85, 34.15], "_lats": [34.1], "_lons": [74.8]}, {"id": "jammu", "name": "Jammu", "name_hi": "जम्मू", "state": "Jammu and Kashmir", "lat": 32.7353, "lon": 74.8617, "tier": "city", "agencies": {"civic": "JAMMU_MC", "water": "JAMMU_MC"}, "agency_names": {"JAMMU_MC": "Jammu Municipal Corporation"}, "bounds": [74.85, 32.65, 74.95, 32.75], "_lats": [32.7], "_lons": [74.9]}, {"id": "prayagraj", "name": "Prayagraj", "name_hi": "प्रयागराज", "state": "Uttar Pradesh", "lat": 25.4448, "lon": 81.8432, "tier": "city", "agencies": {"civic": "PRAYAGRAJ_NN", "water": "PRAYAGRAJ_NN"}, "agency_names": {"PRAYAGRAJ_NN": "Prayagraj Nagar Nigam"}, "bounds": [81.75, 25.35, 81.85, 25.45], "_lats": [25.4], "_lons": [81.8]}, {"id": "ranchi", "name": "Ranchi", "name_hi": "रांची", "state": "Jharkhand", "lat": 23.3432, "lon": 85.3094, "tier": "city", "agencies": {"civic": "RANCHI_MC", "water": "RANCHI_MC"}, "agency_names": {"RANCHI_MC": "Ranchi Municipal Corporation"}, "bounds": [85.25, 23.25, 85.35, 23.35], "_lats": [23.3], "_lons": [85.3]}, {"id": "raipur", "name": "Raipur", "name_hi": "रायपुर", "state": "Chhattisgarh", "lat": 21.2333, "lon": 81.6333, "tier": "city", "agencies": {"civic": "RAIPUR_MC", "water": "RAIPUR_MC"}, "agency_names": {"RAIPUR_MC": "Raipur Municipal Corporation"}, "bounds": [81.55, 21.15, 81.65, 21.25], "_lats": [21.2], "_lons": [81.6]}, {"id": "amritsar", "name": "Amritsar", "name_hi": "अमृतसर", "state": "Punjab", "lat": 31.6223, "lon": 74.8753, "tier": "city", "agencies": {"civic": "AMRITSAR_MC", "water": "AMRITSAR_MC"}, "agency_names": {"AMRITSAR_MC": "Amritsar Municipal Corporation"}, "bounds": [74.85, 31.55, 74.95, 31.65], "_lats": [31.6], "_lons": [74.9]}, {"id": "jodhpur", "name": "Jodhpur", "name_hi": "जोधपुर", "state": "Rajasthan", "lat": 26.2684, "lon": 73.0059, "tier": "city", "agencies": {"civic": "JODHPUR_MC", "water": "PHED"}, "agency_names": {"PHED": "Public Health Engineering Department Rajasthan", "JODHPUR_MC": "Jodhpur Municipal Corporation"}, "bounds": [72.95, 26.25, 73.05, 26.35], "_lats": [26.3], "_lons": [73.0]}, {"id": "gwalior", "name": "Gwalior", "name_hi": "ग्वालियर", "state": "Madhya Pradesh", "lat": 26.2298, "lon": 78.1734, "tier": "city", "agencies": {"civic": "GWALIOR_MC", "water": "GWALIOR_MC"}, "agency_names": {"GWALIOR_MC": "Gwalior Municipal Corporation"}, "bounds": [78.15, 26.15, 78.25, 26.25], "_lats": [26.2], "_lons": [78.2]}, {"id": "jabalpur", "name": "Jabalpur", "name_hi": "जबलपुर", "state": "Madhya Pradesh", "lat": 23.167, "lon": 79.9501, "tier": "city", "agencies": {"civic": "JABALPUR_MC", "water": "JABALPUR_MC"}, "agency_names": {"JABALPUR_MC": "Jabalpur Municipal Corporation"}, "bounds": [79.95, 23.15, 80.05, 23.25], "_lats": [23.2], "_lons": [80.0]}, {"id": "kota", "name": "Kota", "name_hi": "कोटा", "state": "Rajasthan", "lat": 25.1825, "lon": 75.8391, "tier": "city", "agencies": {"civic": "KOTA_MC", "water": "PHED"}, "agency_names": {"PHED": "Public Health Engineering Department Rajasthan", "KOTA_MC": "Kota Municipal Corporation"}, "bounds": [75.75, 25.15, 75.85, 25.25], "_lats": [25.2], "_lons": [75.8]}, {"id": "vijayawada", "name": "Vijayawada", "name_hi": "विजयवाड़ा", "state": "Andhra Pradesh", "lat": 16.5074, "lon": 80.6466, "tier": "city", "agencies": {"civic": "VMC_VJA", "water": "VMC_VJA"}, "agency_names": {"VMC_VJA": "Vijayawada Municipal Corporation"}, "bounds": [80.55, 16.45, 80.65, 16.55], "_lats": [16.5], "_lons": [80.6]}, {"id": "madurai", "name": "Madurai", "name_hi": "मदुरै", "state": "Tamil Nadu", "lat": 9.919, "lon": 78.1195, "tier": "city", "agencies": {"civic": "MADURAI_MC", "water": "MADURAI_MC"}, "agency_names": {"MADURAI_MC": "Madurai Corporation"}, "bounds": [78.05, 9.85, 78.15, 9.95], "_lats": [9.9], "_lons": [78.1]}, {"id": "coimbatore", "name": "Coimbatore", "name_hi": "कोयंबटूर", "state": "Tamil Nadu", "lat": 11.0055, "lon": 76.9661, "tier": "city", "agencies": {"civic": "COIMBATORE_MC", "water": "COIMBATORE_MC"}, "agency_names": {"COIMBATORE_MC": "Coimbatore City Municipal Corporation"}, "bounds": [76.95, 10.95, 77.05, 11.05], "_lats": [11.0], "_lons": [77.0]}, {"id": "tiruchirappalli", "name": "Tiruchirappalli", "name_hi": "तिरुचिरापल्ली", "state": "Tamil Nadu", "lat": 10.8155, "lon": 78.6965, "tier": "city", "agencies": {"civic": "TRICHY_MC", "water": "TRICHY_MC"}, "agency_names": {"TRICHY_MC": "Tiruchirappalli City Corporation"}, "bounds": [78.65, 10.75, 78.75, 10.85], "_lats": [10.8], "_lons": [78.7]}, {"id": "kochi", "name": "Kochi", "name_hi": "कोच्चि", "state": "Kerala", "lat": 9.9399, "lon": 76.2602, "tier": "city", "agencies": {"civic": "KOCHI_MC", "water": "KWA"}, "agency_names": {"KWA": "Kerala Water Authority", "KOCHI_MC": "Kochi Municipal Corporation"}, "bounds": [76.25, 9.85, 76.35, 9.95], "_lats": [9.9], "_lons": [76.3]}, {"id": "thiruvananthapuram", "name": "Thiruvananthapuram", "name_hi": "तिरुवनंतपुरम", "state": "Kerala", "lat": 8.4855, "lon": 76.9492, "tier": "city", "agencies": {"civic": "TVM_MC", "water": "KWA"}, "agency_names": {"KWA": "Kerala Water Authority", "TVM_MC": "Thiruvananthapuram Municipal Corporation"}, "bounds": [76.85, 8.45, 76.95, 8.55], "_lats": [8.5], "_lons": [76.9]}, {"id": "kozhikode", "name": "Kozhikode", "name_hi": "कोझिकोड", "state": "Kerala", "lat": 11.248, "lon": 75.7804, "tier": "city", "agencies": {"civic": "KOZHIKODE_MC", "water": "KWA"}, "agency_names": {"KWA": "Kerala Water Authority", "KOZHIKODE_MC": "Kozhikode Municipal Corporation"}, "bounds": [75.75, 11.15, 75.85, 11.25], "_lats": [11.2], "_lons": [75.8]}, {"id": "chandigarh", "name": "Chandigarh", "name_hi": "चंडीगढ़", "state": "Chandigarh", "lat": 30.7363, "lon": 76.7884, "tier": "city", "agencies": {"civic": "MC_CHANDIGARH", "water": "MC_CHANDIGARH"}, "agency_names": {"MC_CHANDIGARH": "Municipal Corporation Chandigarh"}, "bounds": [76.75, 30.65, 76.85, 30.75], "_lats": [30.7], "_lons": [76.8]}, {"id": "dehradun", "name": "Dehradun", "name_hi": "देहरादून", "state": "Uttarakhand", "lat": 30.3244, "lon": 78.0339, "tier": "city", "agencies": {"civic": "DEHRADUN_MC", "water": "UJS"}, "agency_names": {"UJS": "Uttarakhand Jal Sansthan", "DEHRADUN_MC": "Dehradun Municipal Corporation"}, "bounds": [77.95, 30.25, 78.05, 30.35], "_lats": [30.3], "_lons": [78.0]}, {"id": "shimla", "name": "Shimla", "name_hi": "शिमला", "state": "Himachal Pradesh", "lat": 31.1044, "lon": 77.1666, "tier": "city", "agencies": {"civic": "SHIMLA_MC", "water": "SJPNL"}, "agency_names": {"SJPNL": "Shimla Jal Prabandhan Nigam", "SHIMLA_MC": "Shimla Municipal Corporation"}, "bounds": [77.15, 31.05, 77.25, 31.15], "_lats": [31.1], "_lons": [77.2]}, {"id": "bhubaneswar", "name": "Bhubaneswar", "name_hi": "भुवनेश्वर", "state": "Odisha", "lat": 20.2724, "lon": 85.8338, "tier": "city", "agencies": {"civic": "BBSR_MC", "water": "WATCO"}, "agency_names": {"WATCO": "Water Corporation of Odisha", "BBSR_MC": "Bhubaneswar Municipal Corporation"}, "bounds": [85.75, 20.25, 85.85, 20.35], "_lats": [20.3], "_lons": [85.8]}, {"id": "guwahati", "name": "Guwahati", "name_hi": "गुवाहाटी", "state": "Assam", "lat": 26.1844, "lon": 91.7458, "tier": "city", "agencies": {"civic": "GMC_GHY", "water": "GMC_GHY"}, "agency_names": {"GMC_GHY": "Guwahati Municipal Corporation"}, "bounds": [91.65, 26.15, 91.75, 26.25], "_lats": [26.2], "_lons": [91.7]}, {"id": "dhanbad", "name": "Dhanbad", "name_hi": "धनबाद", "state": "Jharkhand", "lat": 23.7976, "lon": 86.4299, "tier": "city", "agencies": {"civic": "DHANBAD_MC", "water": "DHANBAD_MC"}, "agency_names": {"DHANBAD_MC": "Dhanbad Municipal Corporation"}, "bounds": [86.35, 23.75, 86.45, 23.85], "_lats": [23.8], "_lons": [86.4]}, {"id": "jamshedpur", "name": "Jamshedpur", "name_hi": "जमशेदपुर", "state": "Jharkhand", "lat": 22.8028, "lon": 86.1855, "tier": "city", "agencies": {"civic": "JNAC", "water": "JNAC"}, "agency_names": {"JNAC": "Jamshedpur Notified Area Committee"}, "bounds": [86.15, 22.75, 86.25, 22.85], "_lats": [22.8], "_lons": [86.2]}, {"id": "aurangabad", "name": "Chhatrapati Sambhajinagar", "name_hi": "छत्रपति संभाजीनगर", "state": "Maharashtra", "lat": 19.8776, "lon": 75.3423, "tier": "city", "agencies": {"civic": "CSMC", "water": "CSMC"}, "agency_names": {"CSMC": "Chhatrapati Sambhajinagar Municipal Corporation"}, "bounds": [75.25, 19.85, 75.35, 19.95], "_lats": [19.9], "_lons": [75.3]}, {"id": "gandhinagar", "name": "Gandhinagar", "name_hi": "गांधीनगर", "state": "Gujarat", "lat": 23.2167, "lon": 72.6833, "tier": "city", "agencies": {"civic": "GANDHINAGAR_MC", "water": "GANDHINAGAR_MC"}, "agency_names": {"GANDHINAGAR_MC": "Gandhinagar Municipal Corporation"}, "bounds": [72.65, 23.15, 72.75, 23.25], "_lats": [23.2], "_lons": [72.7]}, {"id": "panaji", "name": "Panaji", "name_hi": "पणजी", "state": "Goa", "lat": 15.4957, "lon": 73.8262, "tier": "city", "agencies": {"civic": "CCP", "water": "PWD_GOA"}, "agency_names": {"PWD_GOA": "Goa Public Works Department (water)", "CCP": "Corporation of the City of Panaji"}, "bounds": [73.75, 15.45, 73.85, 15.55], "_lats": [15.5], "_lons": [73.8]}, {"id": "shillong", "name": "Shillong", "name_hi": "शिलांग", "state": "Meghalaya", "lat": 25.5689, "lon": 91.8831, "tier": "city", "agencies": {"civic": "SMB", "water": "PHED_ML"}, "agency_names": {"PHED_ML": "Public Health Engineering Department Meghalaya", "SMB": "Shillong Municipal Board"}, "bounds": [91.85, 25.55, 91.95, 25.65], "_lats": [25.6], "_lons": [91.9]}, {"id": "imphal", "name": "Imphal", "name_hi": "इंफाल", "state": "Manipur", "lat": 24.8081, "lon": 93.9442, "tier": "city", "agencies": {"civic": "IMC_MN", "water": "PHED_MN"}, "agency_names": {"PHED_MN": "Public Health Engineering Department Manipur", "IMC_MN": "Imphal Municipal Corporation"}, "bounds": [93.85, 24.75, 93.95, 24.85], "_lats": [24.8], "_lons": [93.9]}, {"id": "agartala", "name": "Agartala", "name_hi": "अगरतला", "state": "Tripura", "lat": 23.8361, "lon": 91.2794, "tier": "city", "agencies": {"civic": "AMC_TR", "water": "DWS_TR"}, "agency_names": {"DWS_TR": "Drinking Water and Sanitation Department Tripura", "AMC_TR": "Agartala Municipal Corporation"}, "bounds": [91.25, 23.75, 91.35, 23.85], "_lats": [23.8], "_lons": [91.3]}, {"id": "aizawl", "name": "Aizawl", "name_hi": "आइज़ोल", "state": "Mizoram", "lat": 23.7289, "lon": 92.7179, "tier": "city", "agencies": {"civic": "AMC_MZ", "water": "PHED_MZ"}, "agency_names": {"PHED_MZ": "Public Health Engineering Department Mizoram", "AMC_MZ": "Aizawl Municipal Corporation"}, "bounds": [92.65, 23.65, 92.75, 23.75], "_lats": [23.7], "_lons": [92.7]}, {"id": "kohima", "name": "Kohima", "name_hi": "कोहिमा", "state": "Nagaland", "lat": 25.6747, "lon": 94.111, "tier": "city", "agencies": {"civic": "KMC_NL", "water": "PHED_NL"}, "agency_names": {"PHED_NL": "Public Health Engineering Department Nagaland", "KMC_NL": "Kohima Municipal Council"}, "bounds": [94.05, 25.65, 94.15, 25.75], "_lats": [25.7], "_lons": [94.1]}, {"id": "itanagar", "name": "Itanagar", "name_hi": "ईटानगर", "state": "Arunachal Pradesh", "lat": 27.0869, "lon": 93.6099, "tier": "city", "agencies": {"civic": "IMC_AR", "water": "PHED_AR"}, "agency_names": {"PHED_AR": "Public Health Engineering Department Arunachal Pradesh", "IMC_AR": "Itanagar Municipal Corporation"}, "bounds": [93.55, 27.05, 93.65, 27.15], "_lats": [27.1], "_lons": [93.6]}, {"id": "gangtok", "name": "Gangtok", "name_hi": "गंगटोक", "state": "Sikkim", "lat": 27.3257, "lon": 88.6122, "tier": "city", "agencies": {"civic": "GMC_SK", "water": "PHED_SK"}, "agency_names": {"PHED_SK": "Water Security and Public Health Engineering Department Sikkim", "GMC_SK": "Gangtok Municipal Corporation"}, "bounds": [88.55, 27.25, 88.65, 27.35], "_lats": [27.3], "_lons": [88.6]}, {"id": "puducherry", "name": "Puducherry", "name_hi": "पुदुचेरी", "state": "Puducherry", "lat": 11.9338, "lon": 79.8298, "tier": "city", "agencies": {"civic": "PDY_MUN", "water": "PWD_PY"}, "agency_names": {"PWD_PY": "Puducherry Public Works Department (water)", "PDY_MUN": "Puducherry Municipality"}, "bounds": [79.75, 11.85, 79.85, 11.95], "_lats": [11.9], "_lons": [79.8]}, {"id": "port_blair", "name": "Sri Vijaya Puram (Port Blair)", "name_hi": "श्री विजयपुरम (पोर्ट ब्लेयर)", "state": "Andaman and Nicobar Islands", "lat": 11.6661, "lon": 92.7464, "tier": "city", "agencies": {"civic": "PBMC", "water": "APWD"}, "agency_names": {"APWD": "Andaman Public Works Department", "PBMC": "Port Blair Municipal Council"}, "bounds": [92.65, 11.65, 92.75, 11.75], "_lats": [11.7], "_lons": [92.7]}, {"id": "silvassa", "name": "Silvassa", "name_hi": "सिलवासा", "state": "Dadra and Nagar Haveli and Daman and Diu", "lat": 20.2739, "lon": 72.9967, "tier": "city", "agencies": {"civic": "SMC_DNH", "water": "PWD_DNH"}, "agency_names": {"PWD_DNH": "DNH Public Works Department (water)", "SMC_DNH": "Silvassa Municipal Council"}, "bounds": [72.95, 20.25, 73.05, 20.35], "_lats": [20.3], "_lons": [73.0]}, {"id": "leh", "name": "Leh", "name_hi": "लेह", "state": "Ladakh", "lat": 34.165, "lon": 77.584, "tier": "city", "agencies": {"civic": "MC_LEH", "water": "PHED_LA"}, "agency_names": {"PHED_LA": "Jal Shakti Department Ladakh", "MC_LEH": "Municipal Committee Leh"}, "bounds": [77.55, 34.15, 77.65, 34.25], "_lats": [34.2], "_lons": [77.6]}, {"id": "kavaratti", "name": "Kavaratti", "name_hi": "कवरत्ती", "state": "Lakshadweep", "lat": 10.5669, "lon": 72.642, "tier": "city", "agencies": {"civic": "LAK_ADMIN", "water": "LAK_ADMIN"}, "agency_names": {"LAK_ADMIN": "Lakshadweep Administration"}, "bounds": [72.55, 10.55, 72.65, 10.65], "_lats": [10.6], "_lons": [72.6]}]

export function istIso(d: Date): string {
  const t = new Date(d.getTime() + 5.5 * 3_600_000)
  return t.toISOString().replace(/\.\d{3}Z$/, '+05:30')
}

export function currentHourIst(): Date {
  const now = Date.now()
  const ist = now + 5.5 * 3_600_000
  const floored = ist - (ist % 3_600_000)
  return new Date(floored - 5.5 * 3_600_000)
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) % 1000) / 1000
}

function stull(t: number, rh: number): number {
  return (
    t * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
    Math.atan(t + rh) -
    Math.atan(rh - 1.676331) +
    0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
    4.686035
  )
}

function band(t: number, wb: number): HeatBand {
  if (wb >= 30 || t >= 44) return 'RED'
  if (wb >= 28 || t >= 40) return 'ORANGE'
  if (wb >= 25 || t >= 37) return 'YELLOW'
  return 'GREEN'
}

function cellBase(lat: number, lon: number) {
  const [w, s, e, n] = [lon - 0.05, lat - 0.05, lon + 0.05, lat + 0.05].map((v) => Math.round(v * 100) / 100)
  return { id: `g_${lat.toFixed(1)}_${lon.toFixed(1)}`, lat, lon, bounds: [w, s, e, n] as [number, number, number, number] }
}

function weather(id: string, hourOfDay: number, peak: number, humid: number) {
  const diurnal = Math.cos(((hourOfDay - 15) / 24) * 2 * Math.PI) // 1 at 15:00
  const t = Math.round((peak - 8 + 8 * diurnal + 3 * (hash(id) - 0.5)) * 10) / 10
  const rh = Math.round(Math.min(95, Math.max(12, humid - 18 * diurnal + 10 * (hash(id + 'h') - 0.5))))
  const wb = Math.round(stull(t, rh) * 10) / 10
  return { band: band(t, wb), temp_c: t, rh, wet_bulb_c: wb }
}

const hourOf = (iso: string) => Number(iso.slice(11, 13))

export function heatFor(timeIso: string | undefined): HeatResponse {
  const start = currentHourIst()
  const hours = Array.from({ length: 49 }, (_, i) => istIso(new Date(start.getTime() + i * 3_600_000)))
  const time = timeIso && hours.includes(timeIso) ? timeIso : hours[0]
  const cells = CITY_GRIDS.flatMap((city, ci) =>
    city._lats.flatMap((lat) => city._lons.map((lon) => cellBase(lat, lon))).map((c) => {
      const w = weather(c.id, hourOf(time), 41 - (ci % 4), 45 + (ci % 3) * 12)
      const rain = Math.round(Math.max(0, 70 * hash(c.id + time.slice(11, 13)) - 30) * 10) / 10
      const area = rain >= 60 ? 'HIGH' : rain >= 20 ? 'MEDIUM' : 'LOW'
      return { ...c, city: city.id, ...w, rain_next_3h_mm: rain, area_flood_level: area as FloodLevel }
    }),
  )
  return { time, source: 'open-meteo', data_updated_at: istIso(new Date(start.getTime() + 5 * 60_000)), hours_available: hours, cells }
}

export const HOTSPOTS: Array<Omit<Hotspot, 'level' | 'risk' | 'rain_next_1h_mm' | 'rain_next_3h_mm' | 'confirmed_reports'>> = [
  { id: 'hs_zakhira', name: 'Zakhira flyover and underpass', type: 'underpass', agency: 'PWD', lat: 28.6611, lon: 77.15 },
  { id: 'hs_minto', name: 'Minto Bridge underpass', type: 'underpass', agency: 'PWD', lat: 28.6335, lon: 77.2265 },
  { id: 'hs_pul_prahladpur', name: 'Pul Prahladpur underpass', type: 'underpass', agency: 'PWD', lat: 28.502, lon: 77.289 },
  { id: 'hs_ito', name: 'ITO crossing', type: 'road', agency: 'PWD', lat: 28.628, lon: 77.241 },
  { id: 'hs_azad_market', name: 'Azad Market', type: 'road', agency: 'MCD', lat: 28.6667, lon: 77.2042 },
  { id: 'hs_moolchand', name: 'Moolchand underpass', type: 'underpass', agency: 'PWD', lat: 28.5645, lon: 77.2345 },
  { id: 'hs_dhaula_kuan', name: 'Dhaula Kuan', type: 'road', agency: 'NHAI', lat: 28.5918, lon: 77.1617 },
  { id: 'hs_najafgarh', name: 'Najafgarh drain crossing', type: 'road', agency: 'I&FC', lat: 28.611, lon: 76.98 },
]

function levelFor(risk: number): FloodLevel {
  if (risk >= 0.8) return 'SEVERE'
  if (risk >= 0.55) return 'HIGH'
  if (risk >= 0.3) return 'MEDIUM'
  return 'LOW'
}

function floodState(id: string, hourOfDay: number, wetness: number) {
  const r1 = Math.round(Math.max(0, wetness * (10 + 25 * Math.sin((hourOfDay / 24) * Math.PI)) * hash(id + 'r')) * 10) / 10
  const r3 = Math.round(r1 * 2.1 * 10) / 10
  const risk = Math.round(Math.min(1, (0.3 + 0.5 * hash(id)) * Math.min(1, r3 / 40) + (wetness > 0.5 ? 0.15 : 0)) * 100) / 100
  return { r1, r3, risk }
}

export function floodFor(timeIso: string | undefined): FloodResponse {
  const time = timeIso ?? heatFor(undefined).time
  const hotspots: Hotspot[] = HOTSPOTS.map((h, i) => {
    const { r1, r3, risk } = floodState(h.id, hourOf(time), 0.8)
    const confirmed = i === 0 ? 2 : 0
    return { ...h, level: confirmed ? 'CONFIRMED' : levelFor(risk), risk: confirmed ? Math.max(risk, 0.7) : risk, rain_next_1h_mm: r1, rain_next_3h_mm: r3, confirmed_reports: confirmed }
  })
  return { time, horizon_h: 3, source: 'open-meteo', data_updated_at: heatFor(undefined).data_updated_at, hotspots }
}

export const RELIEF: ReliefPoint[] = [
  { id: 'rp_mock_cz_1', name: 'Cooling zone (mock) near Jama Masjid', kind: 'cooling', status: 'seasonal', lat: 28.6507, lon: 77.2334, cool_room: 'yes', source: 'https://example.org/mock-source' },
  { id: 'rp_mock_cz_2', name: 'Cooling zone (mock) at Kashmere Gate ISBT', kind: 'cooling', status: 'seasonal', lat: 28.6675, lon: 77.2282, cool_room: 'no', source: null },
  { id: 'rp_mock_w_1', name: 'Water point (mock) at Rajiv Chowk', kind: 'water', status: 'open', lat: 28.6328, lon: 77.2197 },
  { id: 'rp_mock_w_2', name: 'Water point (mock) at Lajpat Nagar', kind: 'water', status: 'open', lat: 28.5677, lon: 77.2433 },
  { id: 'rp_mock_h_1', name: 'Hospital (mock) near Ansari Nagar', kind: 'hospital', lat: 28.5672, lon: 77.21 },
  { id: 'rp_mock_h_2', name: 'Hospital (mock) near Rohini', kind: 'hospital', lat: 28.7158, lon: 77.1153 },
]

export function publicReports(photoUrl: string) {
  const now = Date.now()
  const ago = (h: number) => istIso(new Date(now - h * 3_600_000))
  return [
    { id: 'mock_r1', lat: 28.6615, lon: 77.1508, thumb_url: photoUrl, hazard_type: 'waterlogging', water_depth: 'knee', severity: 3, summary_en: 'Mock: knee-deep water under the flyover.', summary_hi: 'मॉक: फ़्लाईओवर के नीचे घुटने तक पानी।', status: 'verified', agency: 'PWD', hotspot_id: 'hs_zakhira', created_at: ago(0.7) },
    { id: 'mock_r2', lat: 28.6338, lon: 77.2261, thumb_url: photoUrl, hazard_type: 'waterlogging', water_depth: 'ankle', severity: 2, summary_en: 'Mock: ankle-deep water at the underpass mouth.', summary_hi: 'मॉक: अंडरपास के मुहाने पर टखने तक पानी।', status: 'verified', agency: 'PWD', hotspot_id: 'hs_minto', created_at: ago(5) },
    { id: 'mock_r3', lat: 28.5648, lon: 77.2349, thumb_url: photoUrl, hazard_type: 'waterlogging', water_depth: 'waist', severity: 4, summary_en: 'Mock: waist-deep water, vehicles stalled.', summary_hi: 'मॉक: कमर तक पानी, गाड़ियाँ फँसी।', status: 'confirmed', agency: 'PWD', hotspot_id: 'hs_moolchand', created_at: ago(6) },
  ]
}

export function officerReports(photoUrl: string): OfficerReport[] {
  return [
    ...publicReports(photoUrl).map((r, i) => ({ ...r, photo_url: photoUrl, confidence: [0.91, 0.84, 0.96][i], note: i === 0 ? 'Mock note: bus stuck near the west lane' : null })),
    { id: 'mock_r4', lat: 28.5025, lon: 77.2885, thumb_url: photoUrl, photo_url: photoUrl, hazard_type: 'waterlogging', water_depth: 'unknown', severity: 2, summary_en: 'Mock: unclear photo, possible pooling.', summary_hi: 'मॉक: फ़ोटो साफ़ नहीं, शायद पानी जमा।', status: 'needs_review', agency: 'PWD', hotspot_id: 'hs_pul_prahladpur', created_at: istIso(new Date(Date.now() - 1.2 * 3_600_000)), confidence: 0.52, note: null },
    { id: 'mock_w1', lat: 28.5794, lon: 77.0471, thumb_url: null, photo_url: null, hazard_type: null, water_depth: null, severity: null, summary_en: null, summary_hi: null, status: 'corroborated', agency: 'DJB', hotspot_id: '', created_at: istIso(new Date(Date.now() - 1.5 * 3_600_000)), confidence: null, note: 'Mock: tanker did not come for 3 days', category: 'water', issue: 'tanker_no_show', source: 'text', corroborations: 4 },
    { id: 'mock_w2', lat: 28.6519, lon: 77.1909, thumb_url: photoUrl, photo_url: photoUrl, hazard_type: 'pipe_leak', water_depth: 'none', severity: 3, summary_en: 'Mock: water gushing from a broken main.', summary_hi: 'मॉक: टूटी पाइपलाइन से पानी बह रहा है।', status: 'verified', agency: 'DJB', hotspot_id: '', created_at: istIso(new Date(Date.now() - 3 * 3_600_000)), confidence: 0.88, note: null, category: 'water', issue: 'leak', source: 'photo' },
  ]
}

export function brief(agency: string): BriefResponse {
  if (agency === 'DJB')
    return {
      agency,
      generated_at: istIso(new Date(Date.now() - 10 * 60_000)),
      actions: [
        { n: 1, spot: 'Near Najafgarh Road (mock)', evidence: 'Mock: 4 people reported no tanker in 24 hours', ask: 'Mock: send a tanker today and confirm the next delivery time', report_ids: ['mock_w1'] },
        { n: 2, spot: 'Karol Bagh main (mock)', evidence: 'Mock: 1 verified photo of a leaking main, 3 hours ago', ask: 'Mock: send a repair crew; isolate the valve', report_ids: ['mock_w2'] },
      ],
    }
  return {
    agency,
    generated_at: istIso(new Date(Date.now() - 10 * 60_000)),
    actions: [
      { n: 1, spot: 'Zakhira flyover and underpass (mock)', evidence: 'Mock: 2 verified reports in the last hour', ask: 'Mock: send a pump; clear the drain inlet on the west lane', report_ids: ['mock_r1'] },
      { n: 2, spot: 'Pul Prahladpur underpass (mock)', evidence: 'Mock: 1 report waiting for review', ask: 'Mock: check the photo and inspect the pump room', report_ids: ['mock_r4'] },
    ],
  }
}

export const SCENARIOS: ScenarioSummary[] = [
  { id: 'flood-2026-07-09', label: 'Replay: modelled data for 9 July 2026', kind: 'flood' },
  { id: 'heat-2026-05-22', label: 'Replay: modelled data for 22 May 2026', kind: 'heat' },
  { id: 'humid-heat-2026-06-18', label: 'Replay: modelled data for 18 June 2026', kind: 'humid-heat' },
]

export function replay(id: string): ReplayScenario | null {
  const sc = SCENARIOS.find((s) => s.id === id)
  if (!sc) return null
  const date = id.slice(-10)
  const base = new Date(`${date}T00:00:00+05:30`)
  const cells = LATS.flatMap((lat) => LONS.map((lon) => cellBase(lat, lon)))
  const peak = sc.kind === 'heat' ? 46 : sc.kind === 'humid-heat' ? 38 : 31
  const humid = sc.kind === 'heat' ? 25 : sc.kind === 'humid-heat' ? 70 : 85
  const hours = Array.from({ length: 24 }, (_, i) => {
    const time = istIso(new Date(base.getTime() + i * 3_600_000))
    const heat = Object.fromEntries(cells.map((c) => [c.id, weather(c.id, i, peak, humid)]))
    const flood =
      sc.kind === 'flood'
        ? Object.fromEntries(
            HOTSPOTS.map((h) => {
              const { r1, r3, risk } = floodState(h.id, i, i < 4 ? 0.2 : i < 12 ? 1.4 : 0.6)
              return [h.id, { level: levelFor(risk), risk, rain_1h_mm: r1, rain_3h_mm: r3 }]
            }),
          )
        : undefined
    return { time, heat, ...(flood ? { flood } : {}) }
  })
  return {
    scenario: id,
    label: sc.label,
    source: 'Open-Meteo Historical Weather API (modelled reanalysis, not station readings)',
    cells,
    hotspots: HOTSPOTS,
    hours,
  }
}

export function cities(): { cities: City[]; india_bbox: { min_lat: number; max_lat: number; min_lon: number; max_lon: number } } {
  return {
    cities: CITY_GRIDS.map(({ _lats, _lons, ...c }) => (void _lats, void _lons, c)),
    india_bbox: { min_lat: 6.5, max_lat: 37.1, min_lon: 68.1, max_lon: 97.4 },
  }
}

export function waterIssues(): { issues: WaterIssue[]; window_h: number; min_reporters: number } {
  const ago = (h: number) => istIso(new Date(Date.now() - h * 3_600_000))
  return {
    window_h: 24,
    min_reporters: 3,
    issues: [
      { issue: 'tanker_no_show', lat: 28.5794, lon: 77.0471, reports: 4, photo_verified: 0, agency: 'DJB', latest: ago(1.5), status: 'corroborated' },
      { issue: 'leak', lat: 28.6519, lon: 77.1909, reports: 1, photo_verified: 1, agency: 'DJB', latest: ago(3), status: 'verified' },
      { issue: 'no_supply', lat: 13.0569, lon: 80.2425, reports: 3, photo_verified: 0, agency: 'CMWSSB', latest: ago(5), status: 'corroborated' },
      { issue: 'dirty_water', lat: 12.9352, lon: 77.6245, reports: 3, photo_verified: 1, agency: 'BWSSB', latest: ago(7), status: 'corroborated' },
    ],
  }
}

export function crew(q: URLSearchParams): CrewSchedule {
  const lat = Number(q.get('lat') ?? 28.61)
  const lon = Number(q.get('lon') ?? 77.21)
  const size = Math.max(1, Math.min(500, Number(q.get('size') ?? 20)))
  const from = Number((q.get('from') ?? '08:00').slice(0, 2))
  const to = Number((q.get('to') ?? '18:00').slice(0, 2))
  const heavyAsked = q.get('heavy') !== '0'
  const wr = { heavy: { GREEN: [50, 10], YELLOW: [45, 15], ORANGE: [45, 15], RED: [0, 60] }, light: { GREEN: [55, 5], YELLOW: [50, 10], ORANGE: [45, 15], RED: [30, 30] } }
  const water = { GREEN: 250, YELLOW: 750, ORANGE: 750, RED: 1000 }
  const hours = Array.from({ length: Math.max(0, to - from) }, (_, i) => {
    const h = from + i
    const w = weather(`crew${lat}${lon}`, h, 42, 40)
    const heavyOk = heavyAsked && (h < 11 || h >= 16) && (w.band === 'GREEN' || w.band === 'YELLOW')
    const kind = heavyOk ? 'heavy' : 'light'
    const [work, rest] = wr[kind][w.band]
    const groups = rest > 0 && rest < 60 ? Math.min(size, Math.round(60 / rest)) : 1
    const per = Math.ceil(size / groups)
    const rotation = Array.from({ length: groups }, (_, g) => ({
      group: 'ABCDEFGHIJKL'[g],
      workers: Math.min(per, size - g * per),
      rest: groups === 1 ? (rest >= 60 ? 'all' : 'none') : `:${String(g * rest).padStart(2, '0')}-:${String(Math.min(60, (g + 1) * rest)).padStart(2, '0')}`,
    })).filter((g) => g.workers > 0)
    return { time: `${String(h).padStart(2, '0')}:00`, band: w.band, temp_c: w.temp_c, wet_bulb_c: w.wet_bulb_c, activity: (work === 0 ? 'rest' : kind) as 'heavy' | 'light' | 'rest', work_min: work, rest_min: rest, water_ml_per_worker: water[w.band], rotation }
  })
  const ml = hours.reduce((n, h) => n + h.water_ml_per_worker, 0)
  const order: HeatBand[] = ['GREEN', 'YELLOW', 'ORANGE', 'RED']
  const worst = hours.reduce<HeatBand>((b, h) => (order.indexOf(h.band) > order.indexOf(b) ? h.band : b), 'GREEN')
  const heavyHours = hours.filter((h) => h.activity === 'heavy').map((h) => h.time)
  return {
    kind: 'crew_schedule',
    location: { lat, lon, label: q.get('label') ?? 'Mock site' },
    city: null,
    coverage: 'full',
    date: q.get('date') ?? istIso(new Date()).slice(0, 10),
    data_updated_at: heatFor(undefined).data_updated_at ?? istIso(new Date()),
    crew_size: size,
    shift: { from: `${String(from).padStart(2, '0')}:00`, to: `${String(to).padStart(2, '0')}:00` },
    worst_band: worst,
    noon_pause: order.indexOf(worst) >= 2 ? { from: '12:00', to: '15:00' } : null,
    heavy_work_hours: heavyHours,
    no_heavy_work: heavyAsked && heavyHours.length === 0,
    hours,
    work_minutes_per_worker: hours.reduce((n, h) => n + h.work_min, 0),
    water: { litres_per_worker: Math.round(ml / 100) / 10, litres_total: Math.ceil((ml * size) / 1000), glasses_per_worker: Math.ceil(ml / 250) },
    ors_needed: worst === 'RED',
  }
}

export function nowFor(q: URLSearchParams): NowResponse {
  const lat = Number(q.get('lat') ?? 28.61)
  const lon = Number(q.get('lon') ?? 77.21)
  const start = currentHourIst()
  const hours = Array.from({ length: 48 }, (_, i) => {
    const time = istIso(new Date(start.getTime() + i * 3_600_000))
    const w = weather(`now${lat}${lon}`, hourOf(time), 41, 45)
    const rain = Math.round(Math.max(0, 40 * hash(time) - 25) * 10) / 10
    const hod = hourOf(time)
    return { time, ...w, rain_next_3h_mm: rain, area_flood_level: (rain >= 20 ? 'MEDIUM' : 'LOW') as FloodLevel, uv_index: hod >= 7 && hod <= 17 ? Math.round(9 * Math.sin(((hod - 6) / 12) * Math.PI) * 10) / 10 : 0 }
  })
  const today = hours.filter((h) => h.time.slice(0, 10) === hours[0].time.slice(0, 10))
  const order: HeatBand[] = ['GREEN', 'YELLOW', 'ORANGE', 'RED']
  const dayBand = today.reduce<HeatBand>((b, h) => (order.indexOf(h.band) > order.indexOf(b) ? h.band : b), 'GREEN')
  return {
    location: { lat, lon, label: q.get('label') ?? 'Mock place', city: null, city_id: null, coverage: 'full' },
    now: hours[0],
    today: {
      date: hours[0].time.slice(0, 10), day_band: dayBand,
      blocks: [{ from: '06:00', to: '11:00', band: 'YELLOW' }, { from: '11:00', to: '16:00', band: dayBand }, { from: '16:00', to: '20:00', band: 'YELLOW' }],
      heavy_work_windows: [{ from: '06:00', to: '11:00' }, { from: '16:00', to: '20:00' }],
      avoid_windows: [{ from: '11:00', to: '16:00' }], noon_pause: order.indexOf(dayBand) >= 2 ? { from: '12:00', to: '15:00' } : null,
      peak_hour: null, advice_keys: [],
    },
    air: { aqi: 236, category: 'POOR', dominant: 'pm2_5', estimate: true, pm2_5: 101.2, pm10: 180.4, advice_keys: ['air_mask', 'air_breaks'] },
    uv: { now: hours[0].uv_index ?? 0, now_category: 'LOW', today_max: 8.6, today_category: 'VERY_HIGH', advice_keys: ['uv_cover', 'uv_shade_noon'] },
    hours,
    days: [0, 1, 2].map((i) => {
      const date = istIso(new Date(start.getTime() + i * 86_400_000)).slice(0, 10)
      const band = (['ORANGE', 'RED', 'YELLOW'] as HeatBand[])[i]
      return { date, day_band: band, heavy_work_windows: band === 'RED' ? [] : [{ from: '06:00', to: '11:00' }, { from: '16:00', to: '20:00' }],
               noon_pause: band === 'YELLOW' ? null : { from: '12:00', to: '15:00' }, max_temp_c: [41.2, 44.6, 38.9][i], max_wet_bulb_c: [27.5, 29.1, 26.0][i] }
    }),
    source: 'open-meteo',
    data_updated_at: heatFor(undefined).data_updated_at ?? istIso(new Date()),
  }
}
