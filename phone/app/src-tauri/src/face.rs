use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

pub const UNKNOWN: &str = "unknown";
pub const AMBIGUOUS: &str = "ambiguous";
const DEFAULT_THRESHOLD: f32 = 0.48;
const DEFAULT_MARGIN: f32 = 0.08;
const DEFAULT_TEMPLATE_TOP_K: usize = 3;
const DEFAULT_MIN_SUPPORT: usize = 2;

#[derive(Clone, Debug, Deserialize)]
pub struct NativeTimings {
    pub preprocess_ms: f64,
    pub detection_ms: f64,
    pub postprocess_ms: f64,
    pub recognition_ms: f64,
    pub recognizer_load_ms: f64,
    pub native_total_ms: f64,
}

#[derive(Clone, Debug, Deserialize)]
pub struct NativeFace {
    pub bbox: [f32; 4],
    pub detection_score: f32,
    pub eligible: bool,
    pub landmarks: [[f32; 2]; 5],
    #[serde(default)]
    pub embedding: Vec<f32>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct NativeFaceAnalysis {
    pub image_width: u32,
    pub image_height: u32,
    pub detected_count: usize,
    pub eligible_count: usize,
    pub recognition_invoked: bool,
    pub faces: Vec<NativeFace>,
    pub timings: NativeTimings,
    pub decode_ms: i64,
    pub model_load_ms: i64,
    pub processing_total_ms: i64,
}

#[derive(Clone, Debug, Serialize)]
pub struct FaceMatch {
    pub decision: String,
    pub person_id: Option<String>,
    pub score: f32,
    pub second_score: f32,
    pub margin: f32,
    pub bbox: [f32; 4],
    pub detection_score: f32,
}

#[derive(Clone, Debug, Serialize)]
pub struct FaceAnalysis {
    pub request_id: u64,
    pub image_width: u32,
    pub image_height: u32,
    pub detected_count: usize,
    pub eligible_count: usize,
    pub recognition_invoked: bool,
    pub matches: Vec<FaceMatch>,
    pub decode_ms: i64,
    pub preprocess_ms: f64,
    pub detection_ms: f64,
    pub postprocess_ms: f64,
    pub recognition_ms: f64,
    pub recognizer_load_ms: f64,
    pub native_total_ms: f64,
    pub processing_total_ms: i64,
    pub gallery_size: usize,
}

#[derive(Clone, Debug, Serialize)]
pub struct EnrollmentReceipt {
    pub person_id: String,
    pub request_id: u64,
    pub templates_for_person: usize,
    pub gallery_templates: usize,
    pub photo_paths: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct GalleryEnrollmentReceipt {
    pub person_id: String,
    pub batch_id: u64,
    pub selected_count: usize,
    pub enrolled_count: usize,
    pub templates_for_person: usize,
    pub gallery_templates: usize,
    pub processing_total_ms: i64,
    pub photo_paths: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct GalleryTemplate {
    person_id: String,
    request_id: u64,
    embedding: Vec<f32>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct FaceGallery {
    version: u32,
    templates: Vec<GalleryTemplate>,
}

impl FaceGallery {
    pub fn load(path: &Path) -> Result<Self, String> {
        if !path.exists() {
            return Ok(Self {
                version: 1,
                templates: Vec::new(),
            });
        }
        let bytes = fs::read(path).map_err(|error| format!("read gallery: {error}"))?;
        let gallery: Self =
            serde_json::from_slice(&bytes).map_err(|error| format!("parse gallery: {error}"))?;
        for template in &gallery.templates {
            validate_embedding(&template.embedding)?;
        }
        Ok(gallery)
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("create gallery directory: {error}"))?;
        }
        let temporary = temporary_path(path);
        let bytes =
            serde_json::to_vec(self).map_err(|error| format!("serialize gallery: {error}"))?;
        let mut file =
            fs::File::create(&temporary).map_err(|error| format!("create gallery: {error}"))?;
        file.write_all(&bytes)
            .and_then(|_| file.sync_all())
            .map_err(|error| format!("write gallery: {error}"))?;
        fs::rename(&temporary, path).map_err(|error| format!("replace gallery: {error}"))
    }

    pub fn enroll(
        &mut self,
        person_id: &str,
        request_id: u64,
        embedding: &[f32],
    ) -> Result<EnrollmentReceipt, String> {
        let person_id = person_id.trim();
        if person_id.is_empty() || person_id.len() > 96 {
            return Err("person_id must contain 1 to 96 characters".into());
        }
        validate_embedding(embedding)?;
        let normalized = normalize(embedding)?;
        self.version = 1;
        self.templates.push(GalleryTemplate {
            person_id: person_id.to_owned(),
            request_id,
            embedding: normalized,
        });
        Ok(EnrollmentReceipt {
            person_id: person_id.to_owned(),
            request_id,
            templates_for_person: self
                .templates
                .iter()
                .filter(|template| template.person_id == person_id)
                .count(),
            gallery_templates: self.templates.len(),
            photo_paths: Vec::new(),
        })
    }

    pub fn enroll_batch(
        &mut self,
        person_id: &str,
        batch_id: u64,
        embeddings: &[Vec<f32>],
        processing_total_ms: i64,
    ) -> Result<GalleryEnrollmentReceipt, String> {
        let person_id = person_id.trim();
        if person_id.is_empty() || person_id.len() > 96 {
            return Err("person_id must contain 1 to 96 characters".into());
        }
        if embeddings.len() != 9 {
            return Err(format!(
                "gallery enrollment requires exactly 9 embeddings, found {}",
                embeddings.len()
            ));
        }
        // Normalize every template before mutating the gallery. A malformed item can
        // therefore never leave a partially enrolled person in memory.
        let normalized = embeddings
            .iter()
            .map(|embedding| {
                validate_embedding(embedding)?;
                normalize(embedding)
            })
            .collect::<Result<Vec<_>, String>>()?;
        self.version = 1;
        self.templates
            .extend(normalized.into_iter().map(|embedding| GalleryTemplate {
                person_id: person_id.to_owned(),
                request_id: batch_id,
                embedding,
            }));
        Ok(GalleryEnrollmentReceipt {
            person_id: person_id.to_owned(),
            batch_id,
            selected_count: embeddings.len(),
            enrolled_count: embeddings.len(),
            templates_for_person: self
                .templates
                .iter()
                .filter(|template| template.person_id == person_id)
                .count(),
            gallery_templates: self.templates.len(),
            processing_total_ms,
            photo_paths: Vec::new(),
        })
    }

    pub fn remove(&mut self, person_id: &str) -> usize {
        let before = self.templates.len();
        self.templates
            .retain(|template| template.person_id != person_id);
        before - self.templates.len()
    }

    pub fn summary(&self) -> BTreeMap<String, usize> {
        let mut summary = BTreeMap::new();
        for template in &self.templates {
            *summary.entry(template.person_id.clone()).or_insert(0) += 1;
        }
        summary
    }

    pub fn template_count(&self) -> usize {
        self.templates.len()
    }

    pub fn identify(
        &self,
        embedding: &[f32],
    ) -> Result<(String, Option<String>, f32, f32, f32), String> {
        validate_embedding(embedding)?;
        let query = normalize(embedding)?;
        let mut per_person: HashMap<&str, Vec<f32>> = HashMap::new();
        for template in &self.templates {
            let score = template
                .embedding
                .iter()
                .zip(&query)
                .map(|(left, right)| left * right)
                .sum();
            per_person
                .entry(&template.person_id)
                .or_default()
                .push(score);
        }
        let mut ranked = per_person
            .into_iter()
            .map(|(person_id, mut scores)| {
                scores.sort_by(|left, right| right.total_cmp(left));
                let count = scores.len().min(DEFAULT_TEMPLATE_TOP_K);
                let aggregate = scores[..count].iter().sum::<f32>() / count as f32;
                let support = scores
                    .iter()
                    .filter(|score| **score >= DEFAULT_THRESHOLD)
                    .count();
                let required_support = scores.len().min(DEFAULT_MIN_SUPPORT);
                (person_id.to_owned(), aggregate, support, required_support)
            })
            .collect::<Vec<_>>();
        ranked.sort_by(|left, right| right.1.total_cmp(&left.1));
        let (best_id, best_score, best_support, required_support) = ranked
            .first()
            .cloned()
            .unwrap_or_else(|| (String::new(), -1.0, 0, 1));
        let second_score = ranked.get(1).map(|entry| entry.1).unwrap_or(-1.0);
        let margin = if ranked.len() > 1 {
            best_score - second_score
        } else {
            2.0
        };
        if best_score < DEFAULT_THRESHOLD || best_support < required_support {
            Ok((UNKNOWN.into(), None, best_score, second_score, margin))
        } else if ranked.len() > 1 && margin < DEFAULT_MARGIN {
            Ok((AMBIGUOUS.into(), None, best_score, second_score, margin))
        } else {
            Ok((
                "known".into(),
                Some(best_id),
                best_score,
                second_score,
                margin,
            ))
        }
    }
}

pub fn apply_gallery(
    request_id: u64,
    native: &NativeFaceAnalysis,
    gallery: &FaceGallery,
) -> Result<FaceAnalysis, String> {
    let mut matches = Vec::with_capacity(native.faces.len());
    for face in &native.faces {
        let (decision, person_id, score, second_score, margin) = if !face.eligible {
            ("too_small".into(), None, -1.0, -1.0, 0.0)
        } else if face.embedding.is_empty() {
            ("embedding_failed".into(), None, -1.0, -1.0, 0.0)
        } else {
            gallery.identify(&face.embedding)?
        };
        matches.push(FaceMatch {
            decision,
            person_id,
            score,
            second_score,
            margin,
            bbox: face.bbox,
            detection_score: face.detection_score,
        });
    }
    Ok(FaceAnalysis {
        request_id,
        image_width: native.image_width,
        image_height: native.image_height,
        detected_count: native.detected_count,
        eligible_count: native.eligible_count,
        recognition_invoked: native.recognition_invoked,
        matches,
        decode_ms: native.decode_ms,
        preprocess_ms: native.timings.preprocess_ms,
        detection_ms: native.timings.detection_ms,
        postprocess_ms: native.timings.postprocess_ms,
        recognition_ms: native.timings.recognition_ms,
        recognizer_load_ms: native.timings.recognizer_load_ms,
        native_total_ms: native.timings.native_total_ms,
        processing_total_ms: native.processing_total_ms,
        gallery_size: gallery.template_count(),
    })
}

fn validate_embedding(embedding: &[f32]) -> Result<(), String> {
    if embedding.len() != 512 {
        return Err(format!(
            "embedding must contain 512 floats, got {}",
            embedding.len()
        ));
    }
    if embedding.iter().any(|value| !value.is_finite()) {
        return Err("embedding contains a non-finite value".into());
    }
    Ok(())
}

fn normalize(embedding: &[f32]) -> Result<Vec<f32>, String> {
    let norm = embedding
        .iter()
        .map(|value| value * value)
        .sum::<f32>()
        .sqrt();
    if norm <= 1.0e-12 {
        return Err("embedding norm is zero".into());
    }
    Ok(embedding.iter().map(|value| value / norm).collect())
}

fn temporary_path(path: &Path) -> PathBuf {
    let mut value = path.as_os_str().to_owned();
    value.push(".tmp");
    PathBuf::from(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unit(index: usize) -> Vec<f32> {
        let mut value = vec![0.0; 512];
        value[index] = 1.0;
        value
    }

    #[test]
    fn incrementally_enrolls_and_identifies_without_retraining() {
        let mut gallery = FaceGallery::default();
        gallery.enroll("alice", 1, &unit(0)).unwrap();
        gallery.enroll("bob", 2, &unit(1)).unwrap();
        let result = gallery.identify(&unit(0)).unwrap();
        assert_eq!(result.0, "known");
        assert_eq!(result.1.as_deref(), Some("alice"));
        assert!(result.2 > 0.99);
    }

    #[test]
    fn rejects_a_gallery_outsider_as_unknown() {
        let mut gallery = FaceGallery::default();
        gallery.enroll("alice", 1, &unit(0)).unwrap();
        let result = gallery.identify(&unit(2)).unwrap();
        assert_eq!(result.0, UNKNOWN);
        assert_eq!(result.1, None);
    }

    #[test]
    fn rejects_a_small_top_two_gap_as_ambiguous() {
        let mut gallery = FaceGallery::default();
        gallery.enroll("alice", 1, &unit(0)).unwrap();
        gallery.enroll("bob", 2, &unit(1)).unwrap();
        let mut query = vec![0.0; 512];
        query[0] = 1.0;
        query[1] = 0.99;
        let result = gallery.identify(&query).unwrap();
        assert_eq!(result.0, AMBIGUOUS);
        assert_eq!(result.1, None);
    }

    #[test]
    fn requires_two_supporting_templates_for_multi_photo_identity() {
        fn with_cosine(score: f32, axis: usize) -> Vec<f32> {
            let mut value = vec![0.0; 512];
            value[0] = score;
            value[axis] = (1.0 - score * score).sqrt();
            value
        }

        let mut gallery = FaceGallery::default();
        gallery.enroll("alice", 1, &unit(0)).unwrap();
        gallery.enroll("alice", 2, &with_cosine(0.40, 1)).unwrap();
        gallery.enroll("alice", 3, &with_cosine(0.40, 2)).unwrap();
        let result = gallery.identify(&unit(0)).unwrap();
        // Top-3 mean is 0.60, but only one independent template reaches the threshold.
        assert!(result.2 > DEFAULT_THRESHOLD);
        assert_eq!(result.0, UNKNOWN);
        assert_eq!(result.1, None);
    }

    #[test]
    fn accepts_two_templates_just_above_relaxed_threshold() {
        fn with_cosine(score: f32, axis: usize) -> Vec<f32> {
            let mut value = vec![0.0; 512];
            value[0] = score;
            value[axis] = (1.0 - score * score).sqrt();
            value
        }

        let mut gallery = FaceGallery::default();
        gallery.enroll("alice", 1, &with_cosine(0.49, 1)).unwrap();
        gallery.enroll("alice", 2, &with_cosine(0.49, 2)).unwrap();
        let result = gallery.identify(&unit(0)).unwrap();
        assert_eq!(result.0, "known");
        assert_eq!(result.1.as_deref(), Some("alice"));
    }
}
