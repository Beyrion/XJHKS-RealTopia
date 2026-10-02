#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FailureKind {
    Transport,
    JsonSyntax,
    RuntimeContract,
}

pub fn classify_failure(error: &str) -> FailureKind {
    let lower = error.to_ascii_lowercase();
    if lower.contains("timeout")
        || lower.contains("超时")
        || lower.contains("http ")
        || lower.contains("tls")
        || lower.contains("service")
    {
        FailureKind::Transport
    } else if lower.contains("json")
        || lower.contains("expected")
        || lower.contains("missing field")
        || lower.contains("invalid type")
    {
        FailureKind::JsonSyntax
    } else {
        FailureKind::RuntimeContract
    }
}

pub fn completion_budget(stage: &str) -> u32 {
    match stage {
        "concept" | "review" => 2_048,
        stage if stage.contains("repair") => 3_072,
        stage if stage.contains("blueprint") => 2_048,
        _ => 4_096,
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SceneBlueprint {
    #[serde(default = "default_density")]
    density: f64,
    #[serde(default)]
    camera_yaw: Option<f64>,
    #[serde(default)]
    camera_pitch: Option<f64>,
    #[serde(default)]
    silhouette: String,
    #[serde(default)]
    habitat_form: String,
    #[serde(default)]
    architecture_style: String,
    #[serde(default)]
    layout: String,
    #[serde(default)]
    features: Vec<BlueprintFeature>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BlueprintFeature {
    #[serde(default)]
    kind: String,
    #[serde(default)]
    color: Option<Value>,
    #[serde(default)]
    animation: Option<String>,
    #[serde(default = "default_emphasis")]
    emphasis: f64,
}

fn default_density() -> f64 {
    0.5
}

fn default_emphasis() -> f64 {
    0.5
}

fn feature_prefab(value: &str) -> Option<TopiaPrefab> {
    Some(match value.trim().to_ascii_lowercase().as_str() {
        "tower" => TopiaPrefab::Tower,
        "sail" => TopiaPrefab::Sail,
        "wind-chimes" | "chimes" => TopiaPrefab::WindChimes,
        "observatory" => TopiaPrefab::Observatory,
        "crystal" => TopiaPrefab::Crystal,
        "cloud" => TopiaPrefab::Cloud,
        "sky-window" => TopiaPrefab::SkyWindow,
        "plant" => TopiaPrefab::Plant,
        "hearth" => TopiaPrefab::Hearth,
        "rug" => TopiaPrefab::Rug,
        "lantern" => TopiaPrefab::Lantern,
        "propeller" => TopiaPrefab::Propeller,
        "path" => TopiaPrefab::Path,
        "farm-shed" => TopiaPrefab::FarmShed,
        "watering-orb" => TopiaPrefab::WateringOrb,
        _ => return None,
    })
}

fn structure_object(
    id: &str,
    prefab: TopiaPrefab,
    position: [f64; 3],
    scale: [f64; 3],
    colors: Vec<u32>,
) -> TopiaObjectConfig {
    TopiaObjectConfig {
        id: id.into(),
        prefab,
        layer: TopiaObjectLayer::Structure,
        position,
        rotation: None,
        scale: Some(scale),
        colors,
        params: HashMap::from([("structural".into(), Value::Bool(true))]),
        anchor_id: None,
        task_id: None,
        memory_ids: vec![],
        animation: None,
    }
}

fn with_anchor(mut object: TopiaObjectConfig, anchor: &str) -> TopiaObjectConfig {
    object.anchor_id = Some(anchor.into());
    object
}

fn with_rotation(mut object: TopiaObjectConfig, rotation: [f64; 3]) -> TopiaObjectConfig {
    object.rotation = Some(rotation);
    object
}

fn with_params(mut object: TopiaObjectConfig, params: &[(&str, f64)]) -> TopiaObjectConfig {
    object.params.extend(
        params
            .iter()
            .map(|(key, value)| ((*key).into(), Value::from(*value))),
    );
    object
}

fn selected_token<'a>(value: &'a str, supported: &[&'a str], fallback: usize) -> &'a str {
    let value = value.trim().to_ascii_lowercase();
    supported
        .iter()
        .copied()
        .find(|candidate| *candidate == value)
        .unwrap_or(supported[fallback % supported.len()])
}

fn architecture_palette(style: &str, concept: &TopiaGenerationConcept) -> [u32; 4] {
    match style {
        "cloud-organic" => [0xf7fbff, 0xcdeeff, concept.palette[1], 0xffeaa7],
        "cycladic-white" => [0xf7f2df, 0x3178b8, 0xe8dcc1, 0x244965],
        "chinese-thatch" => [0xd9c7a2, 0x725535, 0x9f4938, 0xf0dfb1],
        "chinese-red-wall" => [0xa73535, 0x292b32, 0xd5a642, 0xefe1c1],
        "jiangnan-white-wall" => [0xf1eee4, 0x252c31, 0x5f8f86, 0xb38a63],
        "american-modern" => [0xeeeae2, 0x343b43, 0x73c4d5, 0xa97b58],
        "coral-fantasy" => [0xf07b70, 0x4db5ad, 0xf3c768, 0x8b5fa8],
        "ancient-greek" => [0xf1ead8, 0x6089b5, 0xc6a15b, 0x59606d],
        _ => [
            concept.palette[0],
            concept.palette[1],
            concept.palette[2],
            0xf3ead1,
        ],
    }
}

fn island_palette(style: &str, concept: &TopiaGenerationConcept) -> [u32; 3] {
    match style {
        "cloud-organic" => [0xc8e6cf, 0xb8a9bd, 0xcdeeff],
        "cycladic-white" => [0xa8b98a, 0x766b62, 0x8fb4bc],
        "chinese-thatch" => [0x7fa56e, 0x725535, 0xd9c7a2],
        "chinese-red-wall" => [0x789c68, 0x74533d, 0xa73535],
        "jiangnan-white-wall" => [0x7c9f73, 0x5b5147, 0xb38a63],
        "american-modern" => [0x78906c, 0x584a43, 0xa97b58],
        "coral-fantasy" => [0x4db5ad, 0x59606d, 0xf07b70],
        "ancient-greek" => [0x879b72, 0x70675a, 0xc6a15b],
        _ => [concept.palette[0], 0x665b56, concept.palette[2]],
    }
}

fn exterior_structure(
    habitat_form: &str,
    architecture_style: &str,
    concept: &TopiaGenerationConcept,
) -> Vec<TopiaObjectConfig> {
    let [wall, accent, roof, trim] = architecture_palette(architecture_style, concept);
    let [island_ground, island_rock, island_mineral] = island_palette(architecture_style, concept);
    let mut objects = vec![with_params(
        structure_object(
            "home-island",
            TopiaPrefab::FloatingIsland,
            [0.0, 0.0, 0.0],
            [1.0, 1.0, 0.78],
            vec![island_ground, island_rock, island_mineral],
        ),
        &[("radius", 3.5), ("depth", 1.9)],
    )];

    match habitat_form {
        "cloud-house" => objects.extend([
            structure_object(
                "cloud-house-core",
                TopiaPrefab::Cloud,
                [0.0, 1.42, 0.0],
                [3.4, 1.75, 2.25],
                vec![wall],
            ),
            structure_object(
                "cloud-house-left",
                TopiaPrefab::Cloud,
                [-1.9, 1.2, 0.1],
                [2.25, 1.3, 1.55],
                vec![wall],
            ),
            structure_object(
                "cloud-house-crown",
                TopiaPrefab::Cloud,
                [0.45, 2.28, -0.35],
                [1.8, 1.2, 1.35],
                vec![trim],
            ),
            with_anchor(
                structure_object(
                    "cloud-house-door",
                    TopiaPrefab::Door,
                    [0.7, 1.05, 1.48],
                    [1.0, 1.08, 1.0],
                    vec![accent, roof, trim],
                ),
                "portal-interior",
            ),
            structure_object(
                "cloud-house-window",
                TopiaPrefab::RoundWindow,
                [-0.72, 1.58, 1.55],
                [1.25, 1.25, 1.25],
                vec![accent, roof],
            ),
            with_params(
                structure_object(
                    "cloud-house-chimney",
                    TopiaPrefab::Cylinder,
                    [-0.86, 2.45, -0.36],
                    [1.0, 1.0, 1.0],
                    vec![accent],
                ),
                &[("radiusTop", 0.2), ("radiusBottom", 0.28), ("height", 1.2)],
            ),
            structure_object(
                "cloud-house-observatory",
                TopiaPrefab::Observatory,
                [1.1, 2.58, -0.25],
                [1.35, 1.35, 1.35],
                vec![roof],
            ),
            with_params(
                structure_object(
                    "cloud-house-balcony",
                    TopiaPrefab::Path,
                    [0.0, 0.72, 1.65],
                    [1.0, 1.0, 1.0],
                    vec![trim],
                ),
                &[("width", 3.2), ("depth", 0.7)],
            ),
        ]),
        "courtyard-compound" => objects.extend([
            with_params(
                structure_object(
                    "courtyard-rear-hall",
                    TopiaPrefab::Block,
                    [0.0, 0.92, -1.35],
                    [1.0, 1.0, 1.0],
                    vec![wall],
                ),
                &[("width", 4.7), ("height", 1.5), ("depth", 0.5)],
            ),
            with_params(
                structure_object(
                    "courtyard-left-wing",
                    TopiaPrefab::Block,
                    [-2.18, 0.8, 0.0],
                    [1.0, 1.0, 1.0],
                    vec![wall],
                ),
                &[("width", 0.62), ("height", 1.3), ("depth", 2.45)],
            ),
            with_params(
                structure_object(
                    "courtyard-right-wing",
                    TopiaPrefab::Block,
                    [2.18, 0.8, 0.0],
                    [1.0, 1.0, 1.0],
                    vec![wall],
                ),
                &[("width", 0.62), ("height", 1.3), ("depth", 2.45)],
            ),
            with_params(
                structure_object(
                    "courtyard-gate-left",
                    TopiaPrefab::Block,
                    [-0.72, 1.15, 1.28],
                    [1.0, 1.0, 1.0],
                    vec![accent],
                ),
                &[("width", 0.28), ("height", 2.05), ("depth", 0.38)],
            ),
            with_params(
                structure_object(
                    "courtyard-gate-right",
                    TopiaPrefab::Block,
                    [0.72, 1.15, 1.28],
                    [1.0, 1.0, 1.0],
                    vec![accent],
                ),
                &[("width", 0.28), ("height", 2.05), ("depth", 0.38)],
            ),
            with_params(
                structure_object(
                    "courtyard-gate",
                    TopiaPrefab::Block,
                    [0.0, 2.12, 1.28],
                    [1.0, 1.0, 1.0],
                    vec![accent],
                ),
                &[("width", 1.72), ("height", 0.28), ("depth", 0.42)],
            ),
            with_anchor(
                structure_object(
                    "courtyard-door",
                    TopiaPrefab::Door,
                    [0.0, 0.9, 1.52],
                    [1.0, 1.1, 1.0],
                    vec![accent, roof, trim],
                ),
                "portal-interior",
            ),
            with_params(
                with_rotation(
                    structure_object(
                        "courtyard-main-roof",
                        TopiaPrefab::Cone,
                        [0.0, 1.93, -1.35],
                        [2.65, 0.38, 0.72],
                        vec![roof],
                    ),
                    [0.0, 0.0, 0.0],
                ),
                &[
                    ("radius", 1.0),
                    ("height", 1.0),
                    ("segments", 4.0),
                    ("gable", 1.0),
                ],
            ),
            with_params(
                with_rotation(
                    structure_object(
                        "courtyard-left-roof",
                        TopiaPrefab::Cone,
                        [-2.18, 1.6, 0.0],
                        [1.55, 0.34, 0.82],
                        vec![roof],
                    ),
                    [0.0, std::f64::consts::FRAC_PI_2, 0.0],
                ),
                &[
                    ("radius", 1.0),
                    ("height", 1.0),
                    ("segments", 4.0),
                    ("gable", 1.0),
                ],
            ),
            with_params(
                with_rotation(
                    structure_object(
                        "courtyard-right-roof",
                        TopiaPrefab::Cone,
                        [2.18, 1.6, 0.0],
                        [1.55, 0.34, 0.82],
                        vec![roof],
                    ),
                    [0.0, std::f64::consts::FRAC_PI_2, 0.0],
                ),
                &[
                    ("radius", 1.0),
                    ("height", 1.0),
                    ("segments", 4.0),
                    ("gable", 1.0),
                ],
            ),
            with_params(
                structure_object(
                    "courtyard-tree",
                    TopiaPrefab::Plant,
                    [0.0, 0.1, -0.05],
                    [1.15, 1.15, 1.15],
                    vec![trim, concept.palette[0]],
                ),
                &[("tree", 1.0)],
            ),
        ]),
        "cantilever-villa" => objects.extend([
            with_params(
                structure_object(
                    "villa-lower-slab",
                    TopiaPrefab::Block,
                    [-0.35, 0.95, 0.05],
                    [1.0, 1.0, 1.0],
                    vec![wall],
                ),
                &[("width", 4.9), ("height", 0.72), ("depth", 2.15)],
            ),
            with_params(
                structure_object(
                    "villa-upper-volume",
                    TopiaPrefab::Block,
                    [0.95, 1.95, -0.35],
                    [1.0, 1.0, 1.0],
                    vec![wall],
                ),
                &[("width", 4.15), ("height", 1.12), ("depth", 1.75)],
            ),
            with_params(
                structure_object(
                    "villa-glass-wall",
                    TopiaPrefab::Block,
                    [-1.05, 1.46, 1.16],
                    [1.0, 1.0, 1.0],
                    vec![accent],
                ),
                &[("width", 2.25), ("height", 1.35), ("depth", 0.14)],
            ),
            with_params(
                structure_object(
                    "villa-flat-roof",
                    TopiaPrefab::Block,
                    [0.95, 2.7, -0.35],
                    [1.0, 1.0, 1.0],
                    vec![roof],
                ),
                &[("width", 4.65), ("height", 0.16), ("depth", 2.15)],
            ),
            with_params(
                structure_object(
                    "villa-pillar-a",
                    TopiaPrefab::Cylinder,
                    [-1.65, 0.8, -0.45],
                    [1.0, 1.0, 1.0],
                    vec![trim],
                ),
                &[("radiusTop", 0.12), ("radiusBottom", 0.12), ("height", 1.6)],
            ),
            with_params(
                structure_object(
                    "villa-pillar-b",
                    TopiaPrefab::Cylinder,
                    [1.9, 0.8, -0.45],
                    [1.0, 1.0, 1.0],
                    vec![trim],
                ),
                &[("radiusTop", 0.12), ("radiusBottom", 0.12), ("height", 1.6)],
            ),
            with_anchor(
                structure_object(
                    "villa-door",
                    TopiaPrefab::Door,
                    [0.72, 1.02, 1.18],
                    [1.0, 1.0, 1.0],
                    vec![trim, roof, accent],
                ),
                "portal-interior",
            ),
            structure_object(
                "villa-round-window",
                TopiaPrefab::RoundWindow,
                [1.55, 2.05, 0.56],
                [0.95, 0.95, 0.95],
                vec![accent, trim],
            ),
            with_params(
                structure_object(
                    "villa-cantilever-deck",
                    TopiaPrefab::Path,
                    [-2.5, 1.0, 0.15],
                    [1.0, 1.0, 1.0],
                    vec![roof],
                ),
                &[("width", 2.2), ("depth", 1.25)],
            ),
        ]),
        "reef-grotto" => objects.extend([
            with_params(
                structure_object(
                    "reef-central-pod",
                    TopiaPrefab::Cylinder,
                    [0.0, 1.18, 0.0],
                    [1.0, 1.0, 1.0],
                    vec![wall],
                ),
                &[
                    ("radiusTop", 0.82),
                    ("radiusBottom", 1.38),
                    ("height", 2.25),
                    ("segments", 10.0),
                ],
            ),
            with_anchor(
                structure_object(
                    "reef-door",
                    TopiaPrefab::Door,
                    [0.0, 0.86, 1.18],
                    [1.0, 1.0, 1.0],
                    vec![accent, roof, trim],
                ),
                "portal-interior",
            ),
            structure_object(
                "reef-window",
                TopiaPrefab::RoundWindow,
                [-0.15, 1.58, 1.02],
                [0.9, 0.9, 0.9],
                vec![accent, trim],
            ),
            structure_object(
                "reef-spire-a",
                TopiaPrefab::Crystal,
                [-1.6, 1.15, -0.2],
                [2.2, 3.5, 2.2],
                vec![accent],
            ),
            structure_object(
                "reef-spire-b",
                TopiaPrefab::Crystal,
                [1.55, 0.9, -0.7],
                [1.65, 2.8, 1.65],
                vec![roof],
            ),
            structure_object(
                "reef-spire-c",
                TopiaPrefab::Crystal,
                [2.2, 0.58, 0.7],
                [1.1, 1.9, 1.1],
                vec![trim],
            ),
            with_params(
                structure_object(
                    "reef-shell-tower",
                    TopiaPrefab::Tower,
                    [-1.1, 0.3, 0.75],
                    [0.85, 0.9, 0.85],
                    vec![wall, accent],
                ),
                &[("radius", 0.62), ("height", 1.75)],
            ),
            with_params(
                with_rotation(
                    structure_object(
                        "reef-arch",
                        TopiaPrefab::Cone,
                        [0.85, 1.75, -0.25],
                        [1.4, 1.6, 0.85],
                        vec![roof],
                    ),
                    [0.0, 0.45, 0.0],
                ),
                &[("radius", 0.72), ("height", 1.8), ("segments", 5.0)],
            ),
            structure_object(
                "reef-observatory",
                TopiaPrefab::Observatory,
                [0.0, 2.5, -0.2],
                [1.25, 1.25, 1.25],
                vec![trim],
            ),
        ]),
        "tower-village" => objects.extend([
            with_params(
                structure_object(
                    "village-tower-main",
                    TopiaPrefab::Tower,
                    [0.25, 0.25, 0.0],
                    [1.2, 1.25, 1.2],
                    vec![wall, roof],
                ),
                &[("radius", 0.82), ("height", 2.75)],
            ),
            with_params(
                structure_object(
                    "village-tower-left",
                    TopiaPrefab::Tower,
                    [-1.75, 0.2, -0.55],
                    [0.82, 0.9, 0.82],
                    vec![wall, accent],
                ),
                &[("radius", 0.72), ("height", 2.1)],
            ),
            with_params(
                structure_object(
                    "village-tower-right",
                    TopiaPrefab::Tower,
                    [1.9, 0.18, -0.72],
                    [0.72, 0.78, 0.72],
                    vec![wall, trim],
                ),
                &[("radius", 0.68), ("height", 1.9)],
            ),
            with_anchor(
                structure_object(
                    "village-door",
                    TopiaPrefab::Door,
                    [0.25, 0.92, 1.08],
                    [1.0, 1.0, 1.0],
                    vec![accent, roof, trim],
                ),
                "portal-interior",
            ),
            structure_object(
                "village-window",
                TopiaPrefab::RoundWindow,
                [0.25, 1.8, 1.0],
                [0.88, 0.88, 0.88],
                vec![accent, trim],
            ),
            with_params(
                structure_object(
                    "village-bridge-left",
                    TopiaPrefab::Path,
                    [-0.85, 1.02, -0.35],
                    [1.0, 1.0, 1.0],
                    vec![trim],
                ),
                &[("width", 1.8), ("depth", 0.38)],
            ),
            with_params(
                structure_object(
                    "village-bridge-right",
                    TopiaPrefab::Path,
                    [1.05, 0.92, -0.42],
                    [1.0, 1.0, 1.0],
                    vec![trim],
                ),
                &[("width", 1.7), ("depth", 0.38)],
            ),
            structure_object(
                "village-observatory",
                TopiaPrefab::Observatory,
                [0.25, 3.45, 0.0],
                [1.1, 1.1, 1.1],
                vec![accent],
            ),
        ]),
        "stilt-lodge" => objects.extend([
            with_params(
                structure_object(
                    "lodge-stilt-a",
                    TopiaPrefab::Cylinder,
                    [-1.3, 1.0, -0.72],
                    [1.0, 1.0, 1.0],
                    vec![trim],
                ),
                &[("radiusTop", 0.13), ("radiusBottom", 0.18), ("height", 2.0)],
            ),
            with_params(
                structure_object(
                    "lodge-stilt-b",
                    TopiaPrefab::Cylinder,
                    [1.3, 1.0, -0.72],
                    [1.0, 1.0, 1.0],
                    vec![trim],
                ),
                &[("radiusTop", 0.13), ("radiusBottom", 0.18), ("height", 2.0)],
            ),
            with_params(
                structure_object(
                    "lodge-stilt-c",
                    TopiaPrefab::Cylinder,
                    [-1.3, 1.0, 0.72],
                    [1.0, 1.0, 1.0],
                    vec![trim],
                ),
                &[("radiusTop", 0.13), ("radiusBottom", 0.18), ("height", 2.0)],
            ),
            with_params(
                structure_object(
                    "lodge-stilt-d",
                    TopiaPrefab::Cylinder,
                    [1.3, 1.0, 0.72],
                    [1.0, 1.0, 1.0],
                    vec![trim],
                ),
                &[("radiusTop", 0.13), ("radiusBottom", 0.18), ("height", 2.0)],
            ),
            with_params(
                structure_object(
                    "lodge-body",
                    TopiaPrefab::Block,
                    [0.0, 2.3, 0.0],
                    [1.0, 1.0, 1.0],
                    vec![wall],
                ),
                &[("width", 3.8), ("height", 1.5), ("depth", 2.15)],
            ),
            with_params(
                with_rotation(
                    structure_object(
                        "lodge-thatch-roof",
                        TopiaPrefab::Cone,
                        [0.0, 3.45, 0.0],
                        [2.4, 0.85, 1.55],
                        vec![roof],
                    ),
                    [0.0, 0.78, 0.0],
                ),
                &[("radius", 1.0), ("height", 1.35), ("segments", 4.0)],
            ),
            with_anchor(
                structure_object(
                    "lodge-door",
                    TopiaPrefab::Door,
                    [0.55, 2.12, 1.14],
                    [1.0, 1.0, 1.0],
                    vec![accent, roof, trim],
                ),
                "portal-interior",
            ),
            structure_object(
                "lodge-window",
                TopiaPrefab::RoundWindow,
                [-0.72, 2.46, 1.12],
                [0.9, 0.9, 0.9],
                vec![accent, trim],
            ),
            with_params(
                with_rotation(
                    structure_object(
                        "lodge-ramp",
                        TopiaPrefab::Path,
                        [0.55, 1.18, 1.75],
                        [1.0, 1.0, 1.0],
                        vec![trim],
                    ),
                    [-0.42, 0.0, 0.0],
                ),
                &[("width", 0.72), ("depth", 2.2)],
            ),
        ]),
        "temple-terrace" => objects.extend([
            with_params(
                structure_object(
                    "temple-platform",
                    TopiaPrefab::Block,
                    [0.0, 0.52, 0.0],
                    [1.0, 1.0, 1.0],
                    vec![wall],
                ),
                &[("width", 5.2), ("height", 0.55), ("depth", 3.1)],
            ),
            with_params(
                structure_object(
                    "temple-column-a",
                    TopiaPrefab::Cylinder,
                    [-1.55, 1.55, 0.75],
                    [1.0, 1.0, 1.0],
                    vec![wall],
                ),
                &[
                    ("radiusTop", 0.2),
                    ("radiusBottom", 0.27),
                    ("height", 2.35),
                    ("segments", 12.0),
                ],
            ),
            with_params(
                structure_object(
                    "temple-column-b",
                    TopiaPrefab::Cylinder,
                    [-0.52, 1.55, 0.75],
                    [1.0, 1.0, 1.0],
                    vec![wall],
                ),
                &[
                    ("radiusTop", 0.2),
                    ("radiusBottom", 0.27),
                    ("height", 2.35),
                    ("segments", 12.0),
                ],
            ),
            with_params(
                structure_object(
                    "temple-column-c",
                    TopiaPrefab::Cylinder,
                    [0.52, 1.55, 0.75],
                    [1.0, 1.0, 1.0],
                    vec![wall],
                ),
                &[
                    ("radiusTop", 0.2),
                    ("radiusBottom", 0.27),
                    ("height", 2.35),
                    ("segments", 12.0),
                ],
            ),
            with_params(
                structure_object(
                    "temple-column-d",
                    TopiaPrefab::Cylinder,
                    [1.55, 1.55, 0.75],
                    [1.0, 1.0, 1.0],
                    vec![wall],
                ),
                &[
                    ("radiusTop", 0.2),
                    ("radiusBottom", 0.27),
                    ("height", 2.35),
                    ("segments", 12.0),
                ],
            ),
            with_params(
                structure_object(
                    "temple-entablature",
                    TopiaPrefab::Block,
                    [0.0, 2.8, 0.25],
                    [1.0, 1.0, 1.0],
                    vec![trim],
                ),
                &[("width", 4.25), ("height", 0.3), ("depth", 1.8)],
            ),
            with_params(
                with_rotation(
                    structure_object(
                        "temple-pediment",
                        TopiaPrefab::Cone,
                        [0.0, 3.35, 0.25],
                        [2.35, 0.75, 1.25],
                        vec![roof],
                    ),
                    [0.0, 0.0, 0.0],
                ),
                &[("radius", 1.0), ("height", 1.1), ("segments", 3.0)],
            ),
            with_anchor(
                structure_object(
                    "temple-door",
                    TopiaPrefab::Door,
                    [0.0, 1.18, -0.28],
                    [1.0, 1.15, 1.0],
                    vec![accent, roof, trim],
                ),
                "portal-interior",
            ),
            with_params(
                structure_object(
                    "temple-stairs",
                    TopiaPrefab::Path,
                    [0.0, 0.78, 1.75],
                    [1.0, 1.0, 1.0],
                    vec![wall],
                ),
                &[("width", 2.0), ("depth", 1.15)],
            ),
        ]),
        _ => objects.extend([
            with_params(
                with_rotation(
                    structure_object(
                        "capsule-main",
                        TopiaPrefab::Cylinder,
                        [0.0, 1.45, 0.0],
                        [1.0, 1.0, 1.0],
                        vec![wall],
                    ),
                    [0.0, 0.0, std::f64::consts::FRAC_PI_2],
                ),
                &[
                    ("radiusTop", 0.92),
                    ("radiusBottom", 0.92),
                    ("height", 3.9),
                    ("segments", 12.0),
                ],
            ),
            with_params(
                with_rotation(
                    structure_object(
                        "capsule-pod-left",
                        TopiaPrefab::Cylinder,
                        [-1.85, 1.05, -0.7],
                        [0.72, 0.72, 0.72],
                        vec![accent],
                    ),
                    [0.0, 0.0, std::f64::consts::FRAC_PI_2],
                ),
                &[
                    ("radiusTop", 0.78),
                    ("radiusBottom", 0.78),
                    ("height", 2.2),
                    ("segments", 12.0),
                ],
            ),
            with_params(
                with_rotation(
                    structure_object(
                        "capsule-pod-right",
                        TopiaPrefab::Cylinder,
                        [1.85, 1.05, -0.55],
                        [0.72, 0.72, 0.72],
                        vec![roof],
                    ),
                    [0.0, 0.0, std::f64::consts::FRAC_PI_2],
                ),
                &[
                    ("radiusTop", 0.78),
                    ("radiusBottom", 0.78),
                    ("height", 2.2),
                    ("segments", 12.0),
                ],
            ),
            with_anchor(
                structure_object(
                    "capsule-door",
                    TopiaPrefab::Door,
                    [0.4, 1.0, 0.96],
                    [0.9, 1.0, 0.9],
                    vec![accent, trim, roof],
                ),
                "portal-interior",
            ),
            structure_object(
                "capsule-window-left",
                TopiaPrefab::RoundWindow,
                [-0.72, 1.52, 0.88],
                [0.9, 0.9, 0.9],
                vec![accent, trim],
            ),
            structure_object(
                "capsule-window-right",
                TopiaPrefab::RoundWindow,
                [1.45, 1.25, 0.54],
                [0.7, 0.7, 0.7],
                vec![accent, trim],
            ),
            structure_object(
                "capsule-propeller",
                TopiaPrefab::Propeller,
                [-2.85, 1.4, -0.7],
                [1.25, 1.25, 1.25],
                vec![roof, accent],
            ),
            structure_object(
                "capsule-observatory",
                TopiaPrefab::Observatory,
                [0.0, 2.35, 0.0],
                [1.2, 1.2, 1.2],
                vec![accent],
            ),
        ]),
    }

    objects.push(with_anchor(
        with_params(
            structure_object(
                "garden-portal-island",
                TopiaPrefab::FloatingIsland,
                [-3.85, 1.05, -2.35],
                [0.52, 0.52, 0.42],
                vec![accent, trim, roof],
            ),
            &[("radius", 2.15), ("depth", 1.4)],
        ),
        "portal-garden",
    ));
    objects
}

pub(super) fn diversify_fallback_exterior(
    scene: &mut TopiaSceneConfig,
    concept: &TopiaGenerationConcept,
) {
    let bias = concept
        .title
        .bytes()
        .chain(concept.archetype.bytes())
        .fold(0_u64, |hash, byte| {
            hash.wrapping_mul(31).wrapping_add(byte as u64)
        });
    let habitat_forms = [
        "cloud-house",
        "courtyard-compound",
        "cantilever-villa",
        "reef-grotto",
        "tower-village",
        "stilt-lodge",
        "temple-terrace",
        "wandering-capsule",
    ];
    let architecture_styles = [
        "cloud-organic",
        "cycladic-white",
        "chinese-thatch",
        "chinese-red-wall",
        "jiangnan-white-wall",
        "american-modern",
        "coral-fantasy",
        "ancient-greek",
    ];
    scene
        .objects
        .retain(|object| object.layer == TopiaObjectLayer::Decoration);
    scene.landmarks.clear();
    scene.objects.extend(exterior_structure(
        habitat_forms[bias as usize % habitat_forms.len()],
        architecture_styles[(bias >> 7) as usize % architecture_styles.len()],
        concept,
    ));
}

fn apply_layout(
    scene: &mut TopiaSceneConfig,
    location: TopiaLocation,
    layout: &str,
    silhouette_bias: u64,
) {
    if location == TopiaLocation::Exterior {
        return;
    }
    for (index, object) in scene
        .objects
        .iter_mut()
        .filter(|object| {
            object.layer == TopiaObjectLayer::Structure
                && object.prefab != TopiaPrefab::RoomShell
                && object.prefab != TopiaPrefab::FloatingIsland
        })
        .enumerate()
    {
        let phase = index as f64 * 1.73 + (silhouette_bias % 31) as f64 / 10.0;
        match layout {
            "ring" | "courtyard" => {
                let radius = if location == TopiaLocation::Interior {
                    2.25
                } else {
                    2.8
                };
                object.position[0] = phase.cos() * radius;
                object.position[2] = phase.sin() * radius;
            }
            "vertical" => {
                object.position[0] = if index % 2 == 0 { -1.25 } else { 1.25 };
                object.position[1] += (index % 3) as f64 * 0.42;
                object.position[2] = -1.4 + (index % 4) as f64 * 0.9;
            }
            "cantilevered" => {
                object.position[0] = -2.6 + (index % 5) as f64 * 1.25;
                object.position[1] += (index % 2) as f64 * 0.3;
                object.position[2] = if index % 2 == 0 { -1.35 } else { 1.15 };
            }
            "terraced" => {
                object.position[0] = -2.7 + (index % 5) as f64 * 1.3;
                object.position[1] += (index % 3) as f64 * 0.24;
                object.position[2] = -1.35 + (index / 3) as f64 * 0.72;
            }
            "linear" => {
                object.position[0] = -2.7 + (index % 7) as f64 * 0.9;
                object.position[2] = if index % 2 == 0 { -1.1 } else { 1.05 };
            }
            _ => {
                object.position[0] *= 0.78 + (index % 3) as f64 * 0.16;
                object.position[2] *= 0.72 + (index % 2) as f64 * 0.24;
            }
        }
    }
}

fn interior_shape(habitat_form: &str) -> &'static str {
    match habitat_form {
        "temple-terrace" => "terraced-apse",
        "cloud-house" => "cloud-ring",
        "stilt-lodge" => "terraced-loft",
        "courtyard-compound" => "courtyard-ring",
        "cantilever-villa" => "cantilever-loft",
        "reef-grotto" => "crystal-grotto",
        _ => "cloud-ring",
    }
}

fn apply_interior_form(
    scene: &mut TopiaSceneConfig,
    habitat_form: &str,
    architecture_style: &str,
    layout: &str,
    silhouette_bias: u64,
    concept: &TopiaGenerationConcept,
) {
    apply_layout(scene, TopiaLocation::Interior, layout, silhouette_bias);
    let shape = interior_shape(habitat_form);
    let [wall, frame, accent, floor] = architecture_palette(architecture_style, concept);
    for object in &mut scene.objects {
        if object.prefab == TopiaPrefab::RoomShell {
            object.colors = vec![floor, wall, accent, frame];
            object
                .params
                .insert("shape".into(), Value::String(shape.into()));
            object.params.insert(
                "spatialType".into(),
                Value::String(
                    if shape.contains("loft") {
                        "loft"
                    } else if shape == "courtyard-ring" {
                        "courtyard"
                    } else {
                        "single-level"
                    }
                    .into(),
                ),
            );
            object.scale = Some([1.0, 1.0, 1.0]);
            continue;
        }

        let placement = match (shape, object.id.as_str()) {
            ("terraced-apse", "room-window") => Some(([0.8, 2.15, -2.18], 0.0)),
            ("terraced-apse", "bed") => Some(([1.9, 0.55, 1.15], -0.08)),
            ("terraced-apse", "nightstand") => Some(([0.7, 0.55, 1.3], 0.0)),
            ("terraced-apse", "star-map-desk-object") => Some(([-1.55, 1.5, -0.85], 0.08)),
            ("terraced-apse", "desk-chair") => Some(([-1.4, 0.65, 0.1], 0.08)),
            ("terraced-apse", "album-shelf-object") => Some(([-2.45, 1.62, -0.65], -0.08)),
            ("terraced-apse", "window-garden-object") => Some(([2.45, 0.42, -1.0], 0.0)),
            ("terraced-apse", "hearth") => Some(([-2.2, 0.78, 1.15], 0.05)),
            ("terraced-apse", "room-rug") => Some(([0.0, 0.58, 0.2], 0.0)),
            ("terraced-apse", "room-lantern") => Some(([0.0, 2.4, -0.2], 0.0)),
            ("terraced-apse", "room-propeller") => Some(([2.75, 0.95, 0.15], 0.0)),

            ("cloud-ring", "room-window") => Some(([0.8, 1.95, -2.15], 0.08)),
            ("cloud-ring", "bed") => Some(([1.6, 0.18, 0.85], -0.18)),
            ("cloud-ring", "nightstand") => Some(([0.35, 0.22, 1.45], 0.0)),
            ("cloud-ring", "star-map-desk-object") => Some(([-1.55, 1.02, -1.25], 0.22)),
            ("cloud-ring", "desk-chair") => Some(([-1.55, 0.25, -0.25], 0.22)),
            ("cloud-ring", "album-shelf-object") => Some(([-2.45, 1.25, -0.65], -0.38)),
            ("cloud-ring", "window-garden-object") => Some(([2.4, 0.08, -0.9], 0.0)),
            ("cloud-ring", "hearth") => Some(([-2.2, 0.47, 1.25], 0.28)),
            ("cloud-ring", "room-rug") => Some(([0.0, 0.04, 0.15], 0.0)),
            ("cloud-ring", "room-lantern") => Some(([0.0, 2.05, -0.3], 0.0)),
            ("cloud-ring", "room-propeller") => Some(([2.75, 0.68, 0.4], 0.0)),

            ("terraced-loft", "room-window") => Some(([1.25, 2.65, -1.9], 0.08)),
            ("terraced-loft", "bed") => Some(([1.75, 0.18, 0.95], -0.08)),
            ("terraced-loft", "nightstand") => Some(([0.45, 0.22, 1.25], 0.0)),
            ("terraced-loft", "star-map-desk-object") => Some(([-1.4, 2.65, -1.1], 0.0)),
            ("terraced-loft", "desk-chair") => Some(([-1.35, 1.9, -0.15], 0.0)),
            ("terraced-loft", "album-shelf-object") => Some(([-2.45, 2.8, -0.75], -0.08)),
            ("terraced-loft", "window-garden-object") => Some(([2.3, 0.08, -1.25], 0.0)),
            ("terraced-loft", "hearth") => Some(([2.35, 0.47, 0.85], 0.0)),
            ("terraced-loft", "room-rug") => Some(([0.0, 0.04, 0.35], 0.0)),
            ("terraced-loft", "room-lantern") => Some(([-0.2, 3.15, -0.4], 0.0)),
            ("terraced-loft", "room-propeller") => Some(([2.85, 0.75, -0.25], 0.0)),

            ("courtyard-ring", "room-window") => Some(([2.05, 1.75, -2.09], 0.0)),
            ("courtyard-ring", "bed") => Some(([2.0, 0.18, 0.9], 0.05)),
            ("courtyard-ring", "nightstand") => Some(([2.55, 0.22, 0.0], 0.0)),
            ("courtyard-ring", "star-map-desk-object") => Some(([-2.0, 1.02, -0.85], 0.0)),
            ("courtyard-ring", "desk-chair") => Some(([-2.0, 0.25, 0.1], 0.0)),
            ("courtyard-ring", "album-shelf-object") => Some(([-2.75, 1.25, 0.8], 0.0)),
            ("courtyard-ring", "window-garden-object") => Some(([0.0, 0.3, 0.0], 0.0)),
            ("courtyard-ring", "hearth") => Some(([0.0, 0.47, -1.55], 0.0)),
            ("courtyard-ring", "room-rug") => Some(([0.0, 0.04, 1.55], 0.0)),
            ("courtyard-ring", "room-lantern") => Some(([0.0, 2.2, 0.0], 0.0)),
            ("courtyard-ring", "room-propeller") => Some(([2.75, 0.68, -0.7], 0.0)),

            ("cantilever-loft", "room-window") => Some(([1.2, 2.85, -2.08], 0.0)),
            ("cantilever-loft", "bed") => Some(([1.55, 1.88, -0.85], 0.0)),
            ("cantilever-loft", "nightstand") => Some(([2.65, 1.92, -0.7], 0.0)),
            ("cantilever-loft", "star-map-desk-object") => Some(([-1.65, 1.02, -1.05], 0.0)),
            ("cantilever-loft", "desk-chair") => Some(([-1.5, 0.25, -0.05], 0.0)),
            ("cantilever-loft", "album-shelf-object") => Some(([-2.65, 1.25, -0.65], 0.0)),
            ("cantilever-loft", "window-garden-object") => Some(([0.25, 1.58, -1.4], 0.0)),
            ("cantilever-loft", "hearth") => Some(([-2.2, 0.47, 1.1], 0.0)),
            ("cantilever-loft", "room-rug") => Some(([-0.3, 0.04, 0.7], 0.0)),
            ("cantilever-loft", "room-lantern") => Some(([1.4, 3.3, -0.8], 0.0)),
            ("cantilever-loft", "room-propeller") => Some(([2.85, 2.25, -0.65], 0.0)),

            ("crystal-grotto", "room-window") => Some(([1.65, 2.1, -1.85], 0.25)),
            ("crystal-grotto", "bed") => Some(([1.95, 0.58, 0.85], -0.18)),
            ("crystal-grotto", "nightstand") => Some(([1.1, 0.55, 1.3], 0.0)),
            ("crystal-grotto", "star-map-desk-object") => Some(([-2.15, 1.35, 0.6], 0.55)),
            ("crystal-grotto", "desk-chair") => Some(([-1.4, 0.58, 0.2], 0.55)),
            ("crystal-grotto", "album-shelf-object") => Some(([-2.5, 1.45, -0.7], -0.6)),
            ("crystal-grotto", "window-garden-object") => Some(([2.45, 0.2, -0.55], 0.0)),
            ("crystal-grotto", "hearth") => Some(([-0.3, 0.7, 1.55], 0.0)),
            ("crystal-grotto", "room-rug") => Some(([0.25, 0.04, 0.75], 0.0)),
            ("crystal-grotto", "room-lantern") => Some(([0.0, 2.55, -0.45], 0.0)),
            ("crystal-grotto", "room-propeller") => Some(([2.85, 0.8, 0.1], 0.0)),
            _ => None,
        };
        if let Some((position, rotation_y)) = placement {
            object.position = position;
            object.rotation = Some([0.0, rotation_y, 0.0]);
        }
    }
}

fn feature_position(
    layout: &str,
    index: usize,
    angle: f64,
    radius: f64,
    base_y: f64,
    emphasis: f64,
) -> [f64; 3] {
    match layout {
        "ring" | "courtyard" => [angle.cos() * 2.65, base_y + emphasis, angle.sin() * 2.65],
        "vertical" => [
            if index % 2 == 0 { -1.1 } else { 1.1 },
            base_y + emphasis + index as f64 * 0.42,
            -0.65 + (index % 3) as f64 * 0.65,
        ],
        "cantilevered" => [
            -2.55 + index as f64 * 1.08,
            base_y + emphasis + (index % 2) as f64 * 0.34,
            if index % 2 == 0 { -1.45 } else { 1.25 },
        ],
        "terraced" => [
            -2.6 + index as f64 * 1.05,
            base_y + emphasis + (index % 3) as f64 * 0.28,
            -1.25 + (index / 2) as f64 * 0.68,
        ],
        "linear" => [
            -2.5 + index as f64,
            base_y + emphasis,
            if index % 2 == 0 { -1.15 } else { 1.05 },
        ],
        _ => [
            angle.cos() * radius,
            base_y + emphasis,
            angle.sin() * radius,
        ],
    }
}

pub fn compile_blueprint(
    value: &str,
    location: TopiaLocation,
    concept: &TopiaGenerationConcept,
) -> Result<TopiaSceneConfig, String> {
    let blueprint: SceneBlueprint =
        serde_json::from_value(extract_json(value)?).map_err(|error| error.to_string())?;
    let mut scene = fallback_scene(location, concept)?;
    if let Some(yaw) = blueprint.camera_yaw {
        scene.camera.yaw = yaw;
    }
    if let Some(pitch) = blueprint.camera_pitch {
        scene.camera.pitch = pitch;
    }

    let density = if blueprint.density.is_finite() {
        blueprint.density.clamp(0.0, 1.0)
    } else {
        default_density()
    };
    let silhouette_bias = blueprint.silhouette.bytes().fold(0_u64, |hash, byte| {
        hash.wrapping_mul(31).wrapping_add(byte as u64)
    });
    let habitat_form = selected_token(
        &blueprint.habitat_form,
        &[
            "cloud-house",
            "courtyard-compound",
            "cantilever-villa",
            "reef-grotto",
            "tower-village",
            "stilt-lodge",
            "temple-terrace",
            "wandering-capsule",
        ],
        silhouette_bias as usize,
    );
    let architecture_style = selected_token(
        &blueprint.architecture_style,
        &[
            "cloud-organic",
            "cycladic-white",
            "chinese-thatch",
            "chinese-red-wall",
            "jiangnan-white-wall",
            "american-modern",
            "coral-fantasy",
            "ancient-greek",
        ],
        (silhouette_bias >> 5) as usize,
    );
    let layout = selected_token(
        &blueprint.layout,
        &[
            "clustered",
            "courtyard",
            "vertical",
            "cantilevered",
            "terraced",
            "ring",
            "linear",
            "scattered",
        ],
        (silhouette_bias >> 11) as usize,
    );

    if location == TopiaLocation::Exterior {
        scene
            .objects
            .retain(|object| object.layer != TopiaObjectLayer::Structure);
        scene.objects.extend(exterior_structure(
            habitat_form,
            architecture_style,
            concept,
        ));
    } else if location == TopiaLocation::Interior {
        apply_interior_form(
            &mut scene,
            habitat_form,
            architecture_style,
            layout,
            silhouette_bias,
            concept,
        );
    } else {
        apply_layout(&mut scene, location, layout, silhouette_bias);
    }
    for (index, object) in scene
        .objects
        .iter_mut()
        .filter(|object| object.layer == TopiaObjectLayer::Structure)
        .enumerate()
    {
        if let Some(scale) = &mut object.scale {
            let variation = ((silhouette_bias.rotate_left(index as u32) % 17) as f64 - 8.0) / 100.0;
            scale[1] = (scale[1] * (1.0 + variation)).clamp(0.1, 4.0);
        }
    }

    let feature_limit = (2.0 + density * 4.0).round() as usize;
    for (index, feature) in blueprint
        .features
        .into_iter()
        .take(feature_limit)
        .enumerate()
    {
        let Some(prefab) = feature_prefab(&feature.kind) else {
            continue;
        };
        let angle = index as f64 * 2.399_963 + (silhouette_bias % 100) as f64 / 100.0;
        let radius = 1.25 + index as f64 * 0.42;
        let emphasis = if feature.emphasis.is_finite() {
            feature.emphasis.clamp(0.0, 1.0)
        } else {
            default_emphasis()
        };
        let base_y = match location {
            TopiaLocation::Exterior => 0.65,
            TopiaLocation::Interior => 0.15,
            TopiaLocation::Garden => 0.35,
        };
        scene.objects.push(TopiaObjectConfig {
            id: format!("blueprint-{:?}-{index}", location).to_ascii_lowercase(),
            prefab,
            layer: TopiaObjectLayer::Decoration,
            position: feature_position(layout, index, angle, radius, base_y, emphasis),
            rotation: Some([0.0, -angle, 0.0]),
            scale: Some([0.55 + emphasis * 0.45; 3]),
            colors: vec![feature
                .color
                .as_ref()
                .and_then(parse_flexible_color)
                .unwrap_or(concept.palette[index % concept.palette.len()])],
            params: HashMap::new(),
            anchor_id: None,
            task_id: None,
            memory_ids: vec![],
            animation: feature.animation,
        });
    }
    normalize_scene_contract(&mut scene, location)?;
    Ok(scene)
}

pub fn fallback_summary(stage: &str, error: &str) -> String {
    format!(
        "stage={stage} recovery=local-compile kind={:?} error={error}",
        classify_failure(error)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_timeout_for_immediate_local_compilation() {
        assert_eq!(
            classify_failure("cloud completion failed: 请求超时"),
            FailureKind::Transport
        );
    }

    #[test]
    fn keeps_scene_outputs_bounded() {
        assert!(completion_budget("concept") < completion_budget("exterior"));
        assert!(completion_budget("exterior") <= 4_096);
    }

    #[test]
    fn compiles_a_small_blueprint_into_a_valid_scene_contract() {
        let concept = super::super::fallback_concept(&super::super::TopiaGenerationInput {
            profile: super::super::TopiaUserProfileInput {
                display_name: Some("测试".into()),
                summary: "喜欢安静的漂浮空间".into(),
                traits: vec![],
                experiences: vec![],
                preferences: vec![],
                imagery: vec![],
                sensations: vec![],
                style_preferences: vec![],
            },
            context: super::super::TopiaRuntimeContext::default(),
        });
        let scene = compile_blueprint(
            r##"{"density":0.6,"cameraYaw":9,"silhouette":"asymmetric folded arc","features":[{"kind":"crystal","color":"#88ccff","animation":"float"},{"kind":"lantern","emphasis":0.8}]}"##,
            TopiaLocation::Exterior,
            &concept,
        )
        .expect("blueprint should compile");
        super::super::validate_scene(&scene, TopiaLocation::Exterior)
            .expect("compiled scene should satisfy runtime contract");
        assert_eq!(scene.camera.yaw, 3.2);
        assert!(scene.objects.iter().any(|object| {
            object.id.starts_with("blueprint-exterior") && object.prefab == TopiaPrefab::Crystal
        }));
    }
}
use super::{
    extract_json, fallback_scene, normalize_scene_contract, parse_flexible_color,
    TopiaGenerationConcept, TopiaLocation, TopiaObjectConfig, TopiaObjectLayer, TopiaPrefab,
    TopiaSceneConfig,
};
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
