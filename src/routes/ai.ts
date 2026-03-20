// src/routes/ai.ts - AI Features: Cost Estimator, Vendor Recommender, Spec Generator
import { Hono } from 'hono'
import type { Env } from '../lib/db'

const ai = new Hono<{ Bindings: Env }>()

// Cost estimation data per service type (₹ ranges per unit)
const costData: Record<string, any> = {
  solar: {
    name: 'Solar EPC',
    unit: 'kW',
    costPerUnit: { min: 45000, max: 75000 },
    additionalCosts: [
      { item: 'Net Metering Application', fixed: 8000 },
      { item: 'Electrical Panel Upgrade', fixed: 15000 },
      { item: 'Earthing & Lightning Protection', fixed: 12000 },
    ],
    materials: ['Solar Panels (Polycrystalline/Monocrystalline)', 'String Inverter / Micro-inverter', 'Mounting Structure (GI / Aluminum)', 'DC Cables & AC Cables', 'MCB, MCCB, SPD Protection', 'Earthing Kit', 'Net Meter (DISCOM supplied)'],
    timeline: { min: 7, max: 21, unit: 'days' },
    warranty: '5-10 years panel, 2-5 years installation',
    roi: '4-6 years payback period',
    tips: ['Always check DISCOM net metering policy first', 'Tier-1 panels (Adani, Waaree, Vikram) recommended', 'Ensure roof structural capacity ≥ 15 kg/m²']
  },
  electrical: {
    name: 'Electrical Works',
    unit: 'sq ft',
    costPerUnit: { min: 60, max: 120 },
    additionalCosts: [
      { item: 'Main MCB Panel / Distribution Box', fixed: 8000 },
      { item: 'Earthing System', fixed: 5000 },
      { item: 'External Cabling (per meter)', perUnit: 80 },
    ],
    materials: ['FRLS/LSZH Copper Wires', 'MCB/MCCB Panels (Legrand/Havells)', 'PVC Conduits & Junction Boxes', 'Switches & Sockets (Anchor/Legrand)', 'ELCB / Earth Leakage Protection', 'LED Light Fixtures'],
    timeline: { min: 5, max: 14, unit: 'days' },
    warranty: '1 year workmanship',
    tips: ['Use ISI-marked FRLS copper wires only', 'Install separate circuits for AC & heavy appliances', 'Always include ELCB/RCB for safety']
  },
  hvac: {
    name: 'HVAC Installation',
    unit: 'ton',
    costPerUnit: { min: 35000, max: 65000 },
    additionalCosts: [
      { item: 'Ducting (per meter)', perUnit: 1200 },
      { item: 'Electrical Point', fixed: 3000 },
      { item: 'AMC (Annual Maintenance)', fixed: 4500 },
    ],
    materials: ['Split AC / Cassette / VRF Unit', 'Copper Refrigerant Pipes', 'Electrical Cables & MCB', 'PVC Drainage Pipe', 'Wall Brackets / Ceiling Mount', 'Insulation Tape & Fittings'],
    timeline: { min: 3, max: 10, unit: 'days' },
    warranty: '1-5 years depending on brand',
    tips: ['5-star rated ACs save 20-30% on electricity', 'BEE certification recommended', 'VRF/VRV for large commercial spaces']
  },
  plumbing: {
    name: 'Plumbing Works',
    unit: 'bathroom',
    costPerUnit: { min: 25000, max: 70000 },
    additionalCosts: [
      { item: 'Water Purifier Installation', fixed: 3000 },
      { item: 'Geyser / Water Heater Point', fixed: 4000 },
      { item: 'External Pipeline (per meter)', perUnit: 200 },
    ],
    materials: ['CPVC / uPVC Pipes', 'Premium Sanitary Fixtures (Jaquar/Hindware)', 'CP Fittings & Valves', 'Waterproofing Material', 'Concealed Cistern', 'Water Storage Tank & Pump'],
    timeline: { min: 3, max: 12, unit: 'days' },
    warranty: '1 year workmanship, 10 years pipes',
    tips: ['CPVC pipes preferred for hot water lines', 'Always test for leaks before tiling', 'Use ISI-marked pipes for compliance']
  },
  fabrication: {
    name: 'MS Fabrication',
    unit: 'sq ft',
    costPerUnit: { min: 80, max: 200 },
    additionalCosts: [
      { item: 'Primer & Anti-rust Coating', perUnit: 15 },
      { item: 'Welding (per joint)', perUnit: 150 },
      { item: 'Transportation & Erection', fixed: 20000 },
    ],
    materials: ['MS Structural Steel (IS 2062)', 'MS Channels, Angles & Plates', 'Roofing Sheets (GI/Color-coated)', 'Fasteners & Bolts', 'Primer & Anti-corrosion Paint', 'Welding Consumables'],
    timeline: { min: 15, max: 60, unit: 'days' },
    warranty: '2 years structural integrity',
    tips: ['Verify steel quality with mill test certificate', 'IS 2062 Grade A steel for structural work', 'Include provision for expansion/contraction joints']
  },
  contracting: {
    name: 'Civil Contracting',
    unit: 'sq ft',
    costPerUnit: { min: 1200, max: 2800 },
    additionalCosts: [
      { item: 'Architectural Drawing & Approval', fixed: 50000 },
      { item: 'Soil Testing', fixed: 15000 },
      { item: 'RERA Registration', fixed: 25000 },
    ],
    materials: ['OPC/PPC Cement (UltraTech/ACC)', 'TMT Steel Bars (SAIL/Tata)', 'River Sand & Crushed Stone', 'Bricks / AAC Blocks', 'Formwork Material', 'Curing Compound'],
    timeline: { min: 90, max: 365, unit: 'days' },
    warranty: '10 years structural warranty (by law)',
    tips: ['Always verify contractor RERA/license', 'Use RMC concrete for foundations', 'Include 10% contingency in budget']
  }
}

// GET /api/ai/estimate - Project cost estimator
ai.get('/estimate', async (c) => {
  try {
    const { service_type, quantity, location, property_type } = c.req.query()
    if (!service_type || !quantity) {
      return c.json({ error: 'service_type and quantity required' }, 400)
    }
    const svc = costData[service_type]
    if (!svc) return c.json({ error: 'Unknown service type' }, 400)
    const qty = parseFloat(quantity) || 1
    const base_min = svc.costPerUnit.min * qty
    const base_max = svc.costPerUnit.max * qty
    let add_min = 0, add_max = 0
    for (const cost of svc.additionalCosts) {
      if (cost.fixed) { add_min += cost.fixed; add_max += cost.fixed }
      else if (cost.perUnit) { add_min += cost.perUnit * qty * 0.5; add_max += cost.perUnit * qty }
    }
    // Location multiplier: metro cities are 10-20% more expensive
    const metroMultiplier = ['mumbai','delhi','bangalore','hyderabad','chennai','pune'].some(c => (location||'').toLowerCase().includes(c)) ? 1.15 : 1.0
    return c.json({
      service: svc.name,
      quantity: qty,
      unit: svc.unit,
      estimate: {
        base_cost: { min: Math.round(base_min), max: Math.round(base_max) },
        additional_cost: { min: Math.round(add_min), max: Math.round(add_max) },
        total: { min: Math.round((base_min + add_min) * metroMultiplier), max: Math.round((base_max + add_max) * metroMultiplier) },
        per_unit_range: svc.costPerUnit,
        location_multiplier: metroMultiplier,
        gst_inclusive: false,
        gst_note: 'Add 18% GST to the above estimate'
      },
      materials: svc.materials,
      timeline: svc.timeline,
      warranty: svc.warranty,
      roi: svc.roi || null,
      tips: svc.tips,
      additional_costs: svc.additionalCosts,
      disclaimer: 'This is an AI-generated estimate. Actual costs may vary based on site conditions, material quality, and vendor rates. Get multiple bids for best price.'
    })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// GET /api/ai/recommend - Vendor recommender for a project
ai.get('/recommend', async (c) => {
  try {
    const { project_id } = c.req.query()
    if (!project_id) return c.json({ error: 'project_id required' }, 400)
    const db = c.env.DB

    // Get project info
    const project = await db.prepare('SELECT * FROM projects WHERE id = ?').bind(project_id).first() as any
    if (!project) return c.json({ error: 'Project not found' }, 404)

    // Get all approved vendors for this service type
    const vendors = await db.prepare(`
      SELECT u.id, u.name, u.email, vp.company_name, vp.rating, vp.total_reviews, 
        vp.total_projects, vp.experience_years, vp.services_offered, vp.service_area,
        vp.certifications, vp.specializations, vp.subscription_plan,
        (SELECT COUNT(*) FROM bids b WHERE b.vendor_id = u.id AND b.status='accepted') as won_bids,
        (SELECT COUNT(*) FROM bids b WHERE b.vendor_id = u.id) as total_bids
      FROM users u
      JOIN vendor_profiles vp ON vp.user_id = u.id
      WHERE u.is_active = 1 AND vp.is_approved = 1
        AND vp.services_offered LIKE ?
      LIMIT 20
    `).bind(`%${project.service_type}%`).all()

    // Score vendors using AI-like algorithm
    const scored = (vendors.results as any[]).map(v => {
      const win_rate = v.total_bids > 0 ? (v.won_bids / v.total_bids) * 100 : 0
      const location_match = (v.service_area || '').toLowerCase().includes((project.location || '').split(',')[0].toLowerCase()) ? 20 : 0
      const score = (
        (v.rating || 0) * 15 +                          // Rating weight: 15 pts per star
        Math.min((v.total_reviews || 0) * 0.3, 15) +    // Reviews: up to 15 pts
        Math.min((v.experience_years || 0) * 1.5, 20) + // Experience: up to 20 pts
        Math.min((v.total_projects || 0) * 0.5, 15) +   // Projects: up to 15 pts
        win_rate * 0.1 +                                 // Win rate: up to 10 pts
        location_match +                                 // Location match: 20 pts
        (v.subscription_plan === 'pro' ? 5 : v.subscription_plan === 'premium' ? 3 : 0) // Plan bonus
      )
      const reasons = []
      if (v.rating >= 4.5) reasons.push(`High rating ${v.rating}★`)
      if (v.experience_years >= 5) reasons.push(`${v.experience_years}+ years experience`)
      if (location_match) reasons.push('Serves your location')
      if (v.total_projects >= 20) reasons.push(`${v.total_projects} projects completed`)
      if (v.certifications) reasons.push('Certified professional')
      return { ...v, score: Math.round(score), win_rate: Math.round(win_rate), match_reasons: reasons }
    }).sort((a, b) => b.score - a.score).slice(0, 5)

    return c.json({
      project_id,
      service_type: project.service_type,
      recommended_vendors: scored,
      algorithm: 'Scored by rating, experience, location match, win rate, and certifications'
    })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// GET /api/ai/spec-generator - Auto-generate project spec
ai.get('/spec-generator', async (c) => {
  try {
    const { service_type, capacity, location, property_type, area } = c.req.query()
    if (!service_type) return c.json({ error: 'service_type required' }, 400)

    const specs: Record<string, any> = {
      solar: {
        title: `${capacity || '5'}kW Rooftop Solar EPC Installation`,
        description: `Complete design, supply, installation, testing & commissioning of ${capacity || '5'}kW Grid-Tied Rooftop Solar PV System at ${property_type || 'Residential'} premises in ${location || 'India'}.`,
        scope_of_work: [
          `Site survey and shadow analysis for optimal panel placement`,
          `Supply of ${capacity || '5'}kW Solar Panels (Tier-1, Poly/Mono crystalline, BIS certified)`,
          `Supply and installation of ${capacity || '5'}kW String/Micro Inverter (BIS/CE certified)`,
          `MS Hot-dip Galvanized mounting structure installation`,
          `DC cabling with MC4 connectors, AC cabling with proper sizing`,
          `SPD, MCB, MCCB protection devices at DC and AC side`,
          `Earthing and lightning protection system`,
          `Net metering application and DISCOM documentation`,
          `Testing, commissioning and handover with training`,
          `Documentation: Single line diagram, layout drawing, test reports`
        ],
        technical_specs: [
          `System Capacity: ${capacity || '5'} kWp`,
          `Panel Wattage: 500-550W per panel (${Math.ceil((parseFloat(capacity||'5')*1000)/530)} panels approx)`,
          `Inverter Type: Grid-tied string inverter with monitoring`,
          `System Voltage: 48V DC / 230V AC`,
          `Expected Generation: ${Math.round(parseFloat(capacity||'5') * 4.5 * 365)} kWh/year (approx)`,
          `Rooftop Area Required: ${Math.ceil(parseFloat(capacity||'5') * 10)} sq. meters`,
          `Structure Load: Min 15 kg/sq meter roof capacity required`
        ],
        compliance: ['MNRE guidelines', 'CEA regulations', 'IEC 61215/61730 panel standards', 'IEC 62109 inverter standard', 'IS 3043 earthing'],
        deliverables: ['Completion certificate', 'System monitoring setup', 'As-built drawings', 'O&M manual', 'Net meter application', 'Performance test report']
      },
      electrical: {
        title: `Complete Electrical Works for ${property_type || 'Residential'} - ${area || '1500'} sq ft`,
        description: `Complete concealed copper wiring with modern MCB panel, earthing, and all electrical fixtures for ${area || '1500'} sq ft ${property_type || 'residential'} property.`,
        scope_of_work: [
          `Complete electrical layout and load calculation`,
          `Concealed PVC conduit routing for all circuits`,
          `FRLS/LSZH copper wiring as per BIS standards`,
          `MCB Distribution Box with main switch, circuit breakers`,
          `ELCB/RCB for earth leakage protection`,
          `All switches, sockets, fan regulators (ISI mark)`,
          `Earthing system with test pit`,
          `Power points for AC, geyser, and heavy appliances`,
          `External metering panel connection`,
          `Load testing and commissioning report`
        ],
        technical_specs: [
          `Wiring: 1.5 sqmm for lighting, 2.5 sqmm for power, 4 sqmm for AC/heavy`,
          `Panel: 4-way/8-way TPN distribution board`,
          `Earth Wire: Minimum 2.5 sqmm green/yellow wire`,
          `Conduit: 25mm/20mm heavy-duty PVC conduit`,
          `Protection: ELCB 30mA at main panel`,
          `Metering: Single-phase/Three-phase as applicable`
        ],
        compliance: ['IS 732 wiring practice', 'IE Rules 1956', 'NBC 2016 electrical requirements', 'BIS certification for all materials'],
        deliverables: ['Electrical layout drawing', 'Completion certificate', 'Earth resistance test report', 'Load schedule chart']
      },
      hvac: {
        title: `HVAC System Installation - ${capacity || '3'} Ton for ${property_type || 'Residential'}`,
        description: `Complete supply, installation, testing & commissioning of ${capacity || '3'} Ton HVAC system at ${location || 'India'}.`,
        scope_of_work: [
          `HVAC load calculation and equipment selection`,
          `Supply of ${capacity || '3'} Ton rated HVAC unit (5-star rated recommended)`,
          `Copper refrigerant pipe installation with proper insulation`,
          `Electrical wiring and dedicated power point`,
          `PVC drain pipe installation and slope verification`,
          `Wall/ceiling mounting with vibration pads`,
          `Refrigerant charging and leak test`,
          `Trial run and performance test`,
          `AMC contract discussion`
        ],
        technical_specs: [
          `Capacity: ${capacity || '3'} Ton (${Math.round(parseFloat(capacity||'3') * 3517)} BTU/hr)`,
          `EER/COP: Min 5-star BEE rating`,
          `Refrigerant: R32 or R410A (as per model)`,
          `Copper Pipe: 3/8" suction, 1/4" liquid line`,
          `Electrical: 230V single phase / 415V three phase`
        ],
        compliance: ['BEE energy efficiency standards', 'ASHRAE standards', 'IS 1391 room air conditioners'],
        deliverables: ['Installation checklist', 'Refrigerant charge record', 'Performance test report', 'Warranty card registration']
      },
      fabrication: {
        title: `MS Structural Fabrication - ${area || '1000'} sq ft`,
        description: `Design, fabrication, supply and erection of MS structural work for ${property_type || 'Industrial/Commercial'} application at ${location || 'India'}.`,
        scope_of_work: [
          `Structural design and drawing (if required)`,
          `Supply of IS 2062 Grade A MS structural steel`,
          `Fabrication at workshop with quality checks`,
          `Anti-rust primer application (2 coats)`,
          `Transportation to site`,
          `Erection, alignment and leveling`,
          `Welding and bolted connections as per drawing`,
          `Final coat of enamel/epoxy paint`,
          `Load test and handover`
        ],
        technical_specs: [
          `Material: IS 2062 Grade A structural steel`,
          `Welding: IS 816 certified welder`,
          `Surface prep: SA 2.5 or equivalent before painting`,
          `Paint: 1 coat primer + 2 coats enamel/epoxy`,
          `Bolts: GR 8.8 hex bolts/nuts with spring washers`
        ],
        compliance: ['IS 2062 steel standard', 'IS 800 code of practice', 'IS 816 welding standard'],
        deliverables: ['Fabrication drawings', 'Mill test certificate', 'Painting inspection report', 'Handover certificate']
      }
    }
    const spec = specs[service_type] || {
      title: `${service_type} Works`,
      description: `Professional ${service_type} service for ${property_type || 'residential/commercial'} property`,
      scope_of_work: ['Site survey and assessment', 'Material procurement', 'Professional installation', 'Testing and commissioning', 'Handover documentation'],
      technical_specs: ['As per IS standards', 'ISI/BIS marked materials', 'Qualified and certified workforce'],
      compliance: ['Relevant IS standards', 'Local building codes'],
      deliverables: ['Completion certificate', 'Warranty card', 'As-built documentation']
    }
    return c.json({ spec, generated_at: new Date().toISOString() })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

export default ai
