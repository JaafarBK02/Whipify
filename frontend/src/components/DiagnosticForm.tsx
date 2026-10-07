import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button.tsx";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { toast } from "sonner";

const formSchema = z.object({
  make: z.string().min(1, { message: "Please select a make" }),
  model: z.string().min(1, { message: "Please select a model" }),
  year: z
    .string()
    .min(1, { message: "Please enter a year" })
    .refine((val) => /^\d+$/.test(val), { message: "Year must contain only numbers" })
    .refine((val) => Number(val) >= 1900, { message: "Year must be 1900 or later" })
    .refine((val) => Number(val) <= new Date().getFullYear() + 1, { 
      message: `Year cannot be later than ${new Date().getFullYear() + 1}` 
    }),
  mileage: z
    .string()
    .min(1, { message: "Please enter mileage" })
    .refine((val) => /^\d+$/.test(val), { message: "Mileage must contain only numbers" })
    .refine((val) => Number(val) >= 0, { message: "Mileage cannot be negative" })
    .refine((val) => Number(val) <= 999999, { 
      message: "Mileage cannot exceed 999,999" 
    }),
  issueDescription: z
    .string()
    .transform((val) => {
      const normalized = val.normalize('NFKC').trim();
      const noEmojis = normalized.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');
      const cleaned = noEmojis.replace(/[^a-zA-Z0-9\s.,;:!?"'\-()/#]/g, '');
      const collapsed = cleaned.replace(/\s+/g, ' ').trim();
      return collapsed.slice(0, 600);
    })
    .refine(
      (val) => val.length > 0,
      { message: "Please use regular words and punctuation to describe the issue." }
    )
    .refine(
      (val) => {
        if (val.length < 30) return false;
        const words = val.split(/\s+/).filter(w => w.length > 0);
        return words.length >= 6;
      },
      { message: "Please describe your issue in a full sentence." }
    )
    .refine(
      (val) => {
        const safetyTerms = /flames?|fire|thick smoke|brake pedal to the floor|oil pressure light/i;
        if (safetyTerms.test(val)) return true;

        const lowerVal = val.toLowerCase();
        
        const partKeywords = [
          'engine', 'brake', 'brakes', 'pad', 'pads', 'rotor', 'rotors', 'tire', 'tires', 
          'wheel', 'wheels', 'battery', 'belt', 'radiator', 'hose', 'coolant', 'oil', 
          'transmission', 'clutch', 'exhaust', 'steering', 'alternator', 'pump', 'fan', 
          'spark plug', 'plugs', 'filter', 'fuse', 'gasket', 'suspension', 'axle', 'bearing'
        ];
        
        const symptomKeywords = [
          'noise', 'squeal', 'grinding', 'clunk', 'rattle', 'vibration', 'shake', 'leak',
          'smoke', 'steam', 'stall', "won't start", "wont start", 'hard start', 'rough idle',
          'misfire', 'overheat', 'overheating', 'pull', 'pulling', 'wobble', 'squeak',
          'burning smell', 'smell', 'odor', 'whistle', 'humming', 'knocking', 'clicking'
        ];
        
        const contextKeywords = [
          'braking', 'accelerating', 'turning', 'idling', 'cold start', 'uphill', 'downhill',
          'highway', 'high speed', 'low speed', 'after refuel', 'ac on', 'in traffic',
          'reversing', 'parked', 'warm start', 'driving'
        ];
        
        const indicatorKeywords = [
          'check engine', 'cel', 'abs', 'battery light', 'temperature gauge', 'temp gauge',
          'oil pressure', 'tpms', 'airbag light', 'warning light'
        ];
        
        const hasCode = /p0\d{3,4}/i.test(val);
        if (hasCode) return true;
        
        let partMatches = 0;
        let symptomMatches = 0;
        let contextMatches = 0;
        let indicatorMatches = 0;
        
        partKeywords.forEach(kw => { if (lowerVal.includes(kw)) partMatches++; });
        symptomKeywords.forEach(kw => { if (lowerVal.includes(kw)) symptomMatches++; });
        contextKeywords.forEach(kw => { if (lowerVal.includes(kw)) contextMatches++; });
        indicatorKeywords.forEach(kw => { if (lowerVal.includes(kw)) indicatorMatches++; });
        
        const totalMatches = partMatches + symptomMatches + contextMatches + indicatorMatches;
        
        if (partMatches >= 1 || symptomMatches >= 1 || totalMatches >= 2) {
          return true;
        }
        
        return false;
      },
      { message: "Please describe a vehicle-related issue so we can analyze it." }
    )
    .refine(
      (val) => {
        const safetyTerms = /flames?|fire|thick smoke|brake pedal to the floor|oil pressure light/i;
        if (safetyTerms.test(val)) return true;

        const lowerVal = val.toLowerCase();
        
        const offTopicTerms = [
          'hurt', 'pain', 'sick', 'doctor', 'medicine', 'headache', 'diarrhea', 
          'fever', 'hospital', 'clinic', 'back hurts',
          'hungry', 'restaurant', 'order', 'doordash', 'uber eats', 'grocery',
          'laptop', 'phone repair', 'wifi', 'printer', 'router'
        ];
        
        const partKeywords = [
          'engine', 'brake', 'brakes', 'pad', 'pads', 'rotor', 'rotors', 'tire', 'tires', 
          'wheel', 'wheels', 'battery', 'belt', 'radiator', 'hose', 'coolant', 'oil', 
          'transmission', 'clutch', 'exhaust', 'steering', 'alternator', 'pump', 'fan', 
          'spark plug', 'plugs', 'filter', 'fuse', 'gasket', 'suspension', 'axle', 'bearing'
        ];
        
        const symptomKeywords = [
          'noise', 'squeal', 'grinding', 'clunk', 'rattle', 'vibration', 'shake', 'leak',
          'smoke', 'steam', 'stall', "won't start", "wont start", 'hard start', 'rough idle',
          'misfire', 'overheat', 'overheating', 'pull', 'pulling', 'wobble', 'squeak',
          'burning smell', 'smell', 'odor', 'whistle', 'humming', 'knocking', 'clicking'
        ];
        
        const contextKeywords = [
          'braking', 'accelerating', 'turning', 'idling', 'cold start', 'uphill', 'downhill',
          'highway', 'high speed', 'low speed', 'after refuel', 'ac on', 'in traffic',
          'reversing', 'parked', 'warm start', 'driving'
        ];
        
        const indicatorKeywords = [
          'check engine', 'cel', 'abs', 'battery light', 'temperature gauge', 'temp gauge',
          'oil pressure', 'tpms', 'airbag light', 'warning light'
        ];
        
        const hasCode = /p0\d{3,4}/i.test(val);
        
        let partMatches = 0;
        let symptomMatches = 0;
        let contextMatches = 0;
        let indicatorMatches = 0;
        
        partKeywords.forEach(kw => { if (lowerVal.includes(kw)) partMatches++; });
        symptomKeywords.forEach(kw => { if (lowerVal.includes(kw)) symptomMatches++; });
        contextKeywords.forEach(kw => { if (lowerVal.includes(kw)) contextMatches++; });
        indicatorKeywords.forEach(kw => { if (lowerVal.includes(kw)) indicatorMatches++; });
        
        const totalMatches = partMatches + symptomMatches + contextMatches + indicatorMatches;
        const passedRelevanceGate = hasCode || partMatches >= 1 || symptomMatches >= 1 || totalMatches >= 2;
        
        if (!passedRelevanceGate) {
          const hasOffTopicTerm = offTopicTerms.some(term => lowerVal.includes(term));
          if (hasOffTopicTerm) {
            return false;
          }
        }
        
        return true;
      },
      { message: "It looks like this isn't about a car. Please describe what's happening with your vehicle." }
    ),
});

const carMakes = [
  { value: "acura", label: "Acura" },
  { value: "alfa-romeo", label: "Alfa Romeo" },
  { value: "audi", label: "Audi" },
  { value: "bmw", label: "BMW" },
  { value: "buick", label: "Buick" },
  { value: "cadillac", label: "Cadillac" },
  { value: "chevrolet", label: "Chevrolet" },
  { value: "chrysler", label: "Chrysler" },
  { value: "dodge", label: "Dodge" },
  { value: "ford", label: "Ford" },
  { value: "genesis", label: "Genesis" },
  { value: "gmc", label: "GMC" },
  { value: "honda", label: "Honda" },
  { value: "hyundai", label: "Hyundai" },
  { value: "infiniti", label: "Infiniti" },
  { value: "jaguar", label: "Jaguar" },
  { value: "jeep", label: "Jeep" },
  { value: "kia", label: "Kia" },
  { value: "land-rover", label: "Land Rover" },
  { value: "lexus", label: "Lexus" },
  { value: "lincoln", label: "Lincoln" },
  { value: "maserati", label: "Maserati" },
  { value: "mazda", label: "Mazda" },
  { value: "mercedes", label: "Mercedes-Benz" },
  { value: "mini", label: "MINI" },
  { value: "mitsubishi", label: "Mitsubishi" },
  { value: "nissan", label: "Nissan" },
  { value: "porsche", label: "Porsche" },
  { value: "ram", label: "Ram" },
  { value: "subaru", label: "Subaru" },
  { value: "tesla", label: "Tesla" },
  { value: "toyota", label: "Toyota" },
  { value: "volkswagen", label: "Volkswagen" },
  { value: "volvo", label: "Volvo" },
];

const carModels: Record<string, { value: string; label: string }[]> = {
  acura: [
    { value: "integra", label: "Integra" },
    { value: "tlx", label: "TLX" },
    { value: "mdx", label: "MDX" },
    { value: "rdx", label: "RDX" },
    { value: "ilx", label: "ILX" },
    { value: "nsx", label: "NSX" },
  ],
  "alfa-romeo": [
    { value: "giulia", label: "Giulia" },
    { value: "stelvio", label: "Stelvio" },
    { value: "tonale", label: "Tonale" },
  ],
  audi: [
    { value: "a3", label: "A3" },
    { value: "a4", label: "A4" },
    { value: "a5", label: "A5" },
    { value: "a6", label: "A6" },
    { value: "a7", label: "A7" },
    { value: "a8", label: "A8" },
    { value: "q3", label: "Q3" },
    { value: "q5", label: "Q5" },
    { value: "q7", label: "Q7" },
    { value: "q8", label: "Q8" },
    { value: "e-tron", label: "e-tron" },
    { value: "tt", label: "TT" },
  ],
  bmw: [
    { value: "2-series", label: "2 Series" },
    { value: "3-series", label: "3 Series" },
    { value: "4-series", label: "4 Series" },
    { value: "5-series", label: "5 Series" },
    { value: "7-series", label: "7 Series" },
    { value: "8-series", label: "8 Series" },
    { value: "x1", label: "X1" },
    { value: "x3", label: "X3" },
    { value: "x5", label: "X5" },
    { value: "x7", label: "X7" },
    { value: "i4", label: "i4" },
    { value: "ix", label: "iX" },
  ],
  buick: [
    { value: "encore", label: "Encore" },
    { value: "encore-gx", label: "Encore GX" },
    { value: "envision", label: "Envision" },
    { value: "enclave", label: "Enclave" },
  ],
  cadillac: [
    { value: "ct4", label: "CT4" },
    { value: "ct5", label: "CT5" },
    { value: "escalade", label: "Escalade" },
    { value: "xt4", label: "XT4" },
    { value: "xt5", label: "XT5" },
    { value: "xt6", label: "XT6" },
    { value: "lyriq", label: "Lyriq" },
  ],
  chevrolet: [
    { value: "blazer", label: "Blazer" },
    { value: "camaro", label: "Camaro" },
    { value: "colorado", label: "Colorado" },
    { value: "corvette", label: "Corvette" },
    { value: "equinox", label: "Equinox" },
    { value: "malibu", label: "Malibu" },
    { value: "silverado", label: "Silverado" },
    { value: "suburban", label: "Suburban" },
    { value: "tahoe", label: "Tahoe" },
    { value: "traverse", label: "Traverse" },
    { value: "trax", label: "Trax" },
    { value: "bolt-ev", label: "Bolt EV" },
  ],
  chrysler: [
    { value: "300", label: "300" },
    { value: "pacifica", label: "Pacifica" },
    { value: "voyager", label: "Voyager" },
  ],
  dodge: [
    { value: "charger", label: "Charger" },
    { value: "challenger", label: "Challenger" },
    { value: "durango", label: "Durango" },
    { value: "hornet", label: "Hornet" },
  ],
  ford: [
    { value: "bronco", label: "Bronco" },
    { value: "bronco-sport", label: "Bronco Sport" },
    { value: "edge", label: "Edge" },
    { value: "escape", label: "Escape" },
    { value: "expedition", label: "Expedition" },
    { value: "explorer", label: "Explorer" },
    { value: "f-150", label: "F-150" },
    { value: "maverick", label: "Maverick" },
    { value: "mustang", label: "Mustang" },
    { value: "mustang-mach-e", label: "Mustang Mach-E" },
    { value: "ranger", label: "Ranger" },
  ],
  genesis: [
    { value: "g70", label: "G70" },
    { value: "g80", label: "G80" },
    { value: "g90", label: "G90" },
    { value: "gv60", label: "GV60" },
    { value: "gv70", label: "GV70" },
    { value: "gv80", label: "GV80" },
  ],
  gmc: [
    { value: "acadia", label: "Acadia" },
    { value: "canyon", label: "Canyon" },
    { value: "sierra", label: "Sierra" },
    { value: "terrain", label: "Terrain" },
    { value: "yukon", label: "Yukon" },
  ],
  honda: [
    { value: "accord", label: "Accord" },
    { value: "civic", label: "Civic" },
    { value: "cr-v", label: "CR-V" },
    { value: "hr-v", label: "HR-V" },
    { value: "odyssey", label: "Odyssey" },
    { value: "passport", label: "Passport" },
    { value: "pilot", label: "Pilot" },
    { value: "ridgeline", label: "Ridgeline" },
  ],
  hyundai: [
    { value: "elantra", label: "Elantra" },
    { value: "ioniq-5", label: "Ioniq 5" },
    { value: "ioniq-6", label: "Ioniq 6" },
    { value: "kona", label: "Kona" },
    { value: "palisade", label: "Palisade" },
    { value: "santa-fe", label: "Santa Fe" },
    { value: "sonata", label: "Sonata" },
    { value: "tucson", label: "Tucson" },
    { value: "venue", label: "Venue" },
  ],
  infiniti: [
    { value: "q50", label: "Q50" },
    { value: "q60", label: "Q60" },
    { value: "qx50", label: "QX50" },
    { value: "qx55", label: "QX55" },
    { value: "qx60", label: "QX60" },
    { value: "qx80", label: "QX80" },
  ],
  jaguar: [
    { value: "e-pace", label: "E-PACE" },
    { value: "f-pace", label: "F-PACE" },
    { value: "f-type", label: "F-TYPE" },
    { value: "i-pace", label: "I-PACE" },
  ],
  jeep: [
    { value: "cherokee", label: "Cherokee" },
    { value: "compass", label: "Compass" },
    { value: "gladiator", label: "Gladiator" },
    { value: "grand-cherokee", label: "Grand Cherokee" },
    { value: "grand-wagoneer", label: "Grand Wagoneer" },
    { value: "renegade", label: "Renegade" },
    { value: "wagoneer", label: "Wagoneer" },
    { value: "wrangler", label: "Wrangler" },
  ],
  kia: [
    { value: "carnival", label: "Carnival" },
    { value: "ev6", label: "EV6" },
    { value: "ev9", label: "EV9" },
    { value: "forte", label: "Forte" },
    { value: "k5", label: "K5" },
    { value: "niro", label: "Niro" },
    { value: "seltos", label: "Seltos" },
    { value: "sorento", label: "Sorento" },
    { value: "soul", label: "Soul" },
    { value: "sportage", label: "Sportage" },
    { value: "telluride", label: "Telluride" },
  ],
  "land-rover": [
    { value: "defender", label: "Defender" },
    { value: "discovery", label: "Discovery" },
    { value: "discovery-sport", label: "Discovery Sport" },
    { value: "range-rover", label: "Range Rover" },
    { value: "range-rover-evoque", label: "Range Rover Evoque" },
    { value: "range-rover-sport", label: "Range Rover Sport" },
    { value: "range-rover-velar", label: "Range Rover Velar" },
  ],
  lexus: [
    { value: "es", label: "ES" },
    { value: "gx", label: "GX" },
    { value: "is", label: "IS" },
    { value: "lc", label: "LC" },
    { value: "ls", label: "LS" },
    { value: "nx", label: "NX" },
    { value: "rc", label: "RC" },
    { value: "rx", label: "RX" },
    { value: "tx", label: "TX" },
    { value: "ux", label: "UX" },
  ],
  lincoln: [
    { value: "aviator", label: "Aviator" },
    { value: "corsair", label: "Corsair" },
    { value: "nautilus", label: "Nautilus" },
    { value: "navigator", label: "Navigator" },
  ],
  maserati: [
    { value: "ghibli", label: "Ghibli" },
    { value: "grecale", label: "Grecale" },
    { value: "levante", label: "Levante" },
    { value: "quattroporte", label: "Quattroporte" },
  ],
  mazda: [
    { value: "cx-30", label: "CX-30" },
    { value: "cx-5", label: "CX-5" },
    { value: "cx-50", label: "CX-50" },
    { value: "cx-70", label: "CX-70" },
    { value: "cx-90", label: "CX-90" },
    { value: "mazda3", label: "Mazda3" },
    { value: "mx-5-miata", label: "MX-5 Miata" },
  ],
  mercedes: [
    { value: "a-class", label: "A-Class" },
    { value: "c-class", label: "C-Class" },
    { value: "e-class", label: "E-Class" },
    { value: "s-class", label: "S-Class" },
    { value: "gla", label: "GLA" },
    { value: "glb", label: "GLB" },
    { value: "glc", label: "GLC" },
    { value: "gle", label: "GLE" },
    { value: "gls", label: "GLS" },
    { value: "eqb", label: "EQB" },
    { value: "eqe", label: "EQE" },
    { value: "eqs", label: "EQS" },
  ],
  mini: [
    { value: "cooper", label: "Cooper" },
    { value: "countryman", label: "Countryman" },
    { value: "clubman", label: "Clubman" },
  ],
  mitsubishi: [
    { value: "eclipse-cross", label: "Eclipse Cross" },
    { value: "mirage", label: "Mirage" },
    { value: "outlander", label: "Outlander" },
    { value: "outlander-sport", label: "Outlander Sport" },
  ],
  nissan: [
    { value: "altima", label: "Altima" },
    { value: "ariya", label: "Ariya" },
    { value: "armada", label: "Armada" },
    { value: "frontier", label: "Frontier" },
    { value: "kicks", label: "Kicks" },
    { value: "leaf", label: "Leaf" },
    { value: "maxima", label: "Maxima" },
    { value: "murano", label: "Murano" },
    { value: "pathfinder", label: "Pathfinder" },
    { value: "rogue", label: "Rogue" },
    { value: "sentra", label: "Sentra" },
    { value: "titan", label: "Titan" },
    { value: "versa", label: "Versa" },
    { value: "z", label: "Z" },
  ],
  porsche: [
    { value: "911", label: "911" },
    { value: "718", label: "718" },
    { value: "cayenne", label: "Cayenne" },
    { value: "macan", label: "Macan" },
    { value: "panamera", label: "Panamera" },
    { value: "taycan", label: "Taycan" },
  ],
  ram: [
    { value: "1500", label: "1500" },
    { value: "2500", label: "2500" },
    { value: "3500", label: "3500" },
    { value: "promaster", label: "ProMaster" },
  ],
  subaru: [
    { value: "ascent", label: "Ascent" },
    { value: "crosstrek", label: "Crosstrek" },
    { value: "forester", label: "Forester" },
    { value: "impreza", label: "Impreza" },
    { value: "legacy", label: "Legacy" },
    { value: "outback", label: "Outback" },
    { value: "wrx", label: "WRX" },
    { value: "solterra", label: "Solterra" },
  ],
  tesla: [
    { value: "model-3", label: "Model 3" },
    { value: "model-s", label: "Model S" },
    { value: "model-x", label: "Model X" },
    { value: "model-y", label: "Model Y" },
    { value: "cybertruck", label: "Cybertruck" },
  ],
  toyota: [
    { value: "4runner", label: "4Runner" },
    { value: "camry", label: "Camry" },
    { value: "corolla", label: "Corolla" },
    { value: "corolla-cross", label: "Corolla Cross" },
    { value: "crown", label: "Crown" },
    { value: "gr86", label: "GR86" },
    { value: "grand-highlander", label: "Grand Highlander" },
    { value: "highlander", label: "Highlander" },
    { value: "prius", label: "Prius" },
    { value: "rav4", label: "RAV4" },
    { value: "sequoia", label: "Sequoia" },
    { value: "sienna", label: "Sienna" },
    { value: "supra", label: "Supra" },
    { value: "tacoma", label: "Tacoma" },
    { value: "tundra", label: "Tundra" },
    { value: "venza", label: "Venza" },
    { value: "bz4x", label: "bZ4X" },
  ],
  volkswagen: [
    { value: "atlas", label: "Atlas" },
    { value: "atlas-cross-sport", label: "Atlas Cross Sport" },
    { value: "id4", label: "ID.4" },
    { value: "jetta", label: "Jetta" },
    { value: "taos", label: "Taos" },
    { value: "tiguan", label: "Tiguan" },
  ],
  volvo: [
    { value: "c40", label: "C40" },
    { value: "ex30", label: "EX30" },
    { value: "ex90", label: "EX90" },
    { value: "s60", label: "S60" },
    { value: "s90", label: "S90" },
    { value: "v60", label: "V60" },
    { value: "v90", label: "V90" },
    { value: "xc40", label: "XC40" },
    { value: "xc60", label: "XC60" },
    { value: "xc90", label: "XC90" },
  ],
};

interface DiagnosticFormProps {
  onDiagnosisComplete?: (result: {
    risk_band: "green" | "yellow" | "orange" | "red";
    likely_issue: string;
    rationale: string;
    price_estimate?: {
      parts_low: number | null;
      parts_high: number | null;
      notes: string;
    };
  }) => void;
  onDiagnosisCountUpdate?: (remaining?: number) => void;
}

export function DiagnosticForm({ onDiagnosisComplete, onDiagnosisCountUpdate }: DiagnosticFormProps) {
  const [selectedMake, setSelectedMake] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Set when the model needs more detail before it can name a single likely issue
  const [clarifyQuestions, setClarifyQuestions] = useState<string[] | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      make: "",
      model: "",
      year: "",
      mileage: "",
      issueDescription: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      setIsSubmitting(true);

      const payload = {
        access_token: '', // Empty - token comes from cookie now
        symptoms: values.issueDescription,
        vehicle_year: values.year ? Number(values.year) : undefined,
        vehicle_make: values.make || undefined,
        vehicle_model: values.model || undefined,
      };

      const res = await fetch(`${import.meta.env.VITE_API_BASE}/diagnose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        // Check if diagnoses exhausted
        if (res.status === 403 && errorData.detail?.includes("used all")) {
          toast.error("All diagnoses used", {
            description: "You've used all of your free diagnoses for this beta account.",
            duration: 5000,
          });
          onDiagnosisCountUpdate?.(0);
          return;
        }
  
        throw new Error(errorData.detail || `Diagnose failed (${res.status})`);
      }

      const data = await res.json();

      if (data.mode === "clarify") {
        // Keep the form as-is so the user can add answers and re-run
        setClarifyQuestions(Array.isArray(data.questions) ? data.questions : []);
        onDiagnosisCountUpdate?.(
          typeof data.diagnoses_remaining === "number" ? data.diagnoses_remaining : undefined
        );
        toast.info("A couple of questions first", {
          description: "Add your answers to the description and run it again.",
          duration: 4000,
        });
        return;
      }

      setClarifyQuestions(null);
      const mapped = {
        risk_band: (data.risk_band ?? data.riskBand ?? data.risk ?? "").toLowerCase(),
        likely_issue: data.likely_issue ?? data.likelyIssue ?? "",
        rationale: data.rationale ?? data.why ?? "",
        drivable: data.drivable,
        risk_score: data.risk_score ?? data.riskScore,
        price_estimate: data.price_estimate ?? {
          parts_low: null,
          parts_high: null,
          notes: "Price information unavailable"
        }
      };

      // Call the completion callback
      onDiagnosisComplete?.(mapped);

      // Update the remaining-diagnoses banner (backend returns the new count)
      onDiagnosisCountUpdate?.(
        typeof data.diagnoses_remaining === "number" ? data.diagnoses_remaining : undefined
      );

      // Reset form for next diagnosis
      form.reset({
        make: "",
        model: "",
        year: "",
        mileage: "",
        issueDescription: "",
      });
      setSelectedMake(""); // Clear selected make state

      toast.success("Diagnosis Complete!", {
        description: "Results are shown below.",
        duration: 3000,
      });
    } catch (e) {
      const error = e as Error;
      console.error(error);
      toast.error("Diagnosis failed", {
        description: error.message || "Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="make"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-foreground">
                  Make
                </FormLabel>
                <Select
                  onValueChange={(value) => {
                    field.onChange(value);
                    setSelectedMake(value);
                    form.setValue("model", "");
                    form.clearErrors("model"); // Clear model error when make changes
                  }}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger className="bg-background border-input">
                      <SelectValue placeholder="Select make..." />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="bg-popover z-50">
                    {carMakes.map((make) => (
                      <SelectItem key={make.value} value={make.value}>
                        {make.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="model"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-foreground">
                  Model
                </FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={!selectedMake}
                >
                  <FormControl>
                    <SelectTrigger className="bg-background border-input">
                      <SelectValue placeholder="Select model..." />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="bg-popover z-50">
                    {selectedMake &&
                      carModels[selectedMake]?.map((model) => (
                        <SelectItem key={model.value} value={model.value}>
                          {model.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="year"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-foreground">
                  Year
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="e.g., 2015"
                    {...field}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '');
                      field.onChange(value);
                      form.trigger('year');
                    }}
                    className="bg-background border-input"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="mileage"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-foreground">
                  Mileage
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="e.g., 45000"
                    {...field}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '');
                      field.onChange(value);
                      form.trigger('mileage');
                    }}
                    className="bg-background border-input"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="issueDescription"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium text-foreground">
                Issue Description
              </FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Tell us when it happens, any warning lights/smells/leaks, and at what speeds or temps. 2-4 short sentences gives the most reliable result."
                  className="min-h-[120px] bg-background border-input resize-none"
                  {...field}
                  onChange={(e) => {
                    const filteredValue = e.target.value.replace(/[^a-zA-ZÀ-ÿ0-9\s.,;:!?"'\-()/#]/g, '');
                    field.onChange(filteredValue);
                    form.trigger('issueDescription');
                  }}
                />
              </FormControl>
              {clarifyQuestions && clarifyQuestions.length > 0 && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-4 text-sm">
                  <p className="font-medium text-foreground mb-2">
                    To narrow it down, add answers to these and run it again:
                  </p>
                  <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                    {clarifyQuestions.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ol>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Tip: The more detail you share, the more precise your diagnosis will be
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-6"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Diagnosing..." : clarifyQuestions ? "Re-run with my answers" : "Diagnose Issue"}
        </Button>
      </form>
    </Form>
  );
}
