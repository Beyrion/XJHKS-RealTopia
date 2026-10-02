use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

pub const MAX_RECENT_STRANGERS: usize = 10;
pub const MAX_PHOTOS_PER_STRANGER: usize = 9;
const CLUSTER_THRESHOLD: f32 = 0.55;
const MIN_PHOTO_INTERVAL_MS: i64 = 1_500;

#[derive(Clone, Debug, Serialize, Deserialize)]
struct StrangerPhoto {
    path: String,
    request_id: u64,
    captured_at_ms: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct StrangerRecord {
    id: String,
    first_seen_at_ms: i64,
    last_seen_at_ms: i64,
    identity: Option<String>,
    relationship: Option<String>,
    photos: Vec<StrangerPhoto>,
    embeddings: Vec<Vec<f32>>,
}

#[derive(Clone, Debug, Serialize)]
pub struct StrangerSummary {
    pub id: String,
    pub first_seen_at_ms: i64,
    pub last_seen_at_ms: i64,
    pub identity: Option<String>,
    pub relationship: Option<String>,
    pub photo_paths: Vec<String>,
    pub photo_count: usize,
}

#[derive(Clone, Debug)]
pub struct StrangerLabel {
    pub summary: StrangerSummary,
    pub embeddings: Vec<Vec<f32>>,
    pub newly_labeled: bool,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct StrangerStore {
    version: u32,
    records: Vec<StrangerRecord>,
}

impl StrangerStore {
    pub fn load(path: &Path) -> Result<Self, String> {
        if !path.exists() {
            return Ok(Self {
                version: 1,
                records: Vec::new(),
            });
        }
        let bytes = fs::read(path).map_err(|error| format!("read stranger store: {error}"))?;
        let mut value: Self = serde_json::from_slice(&bytes)
            .map_err(|error| format!("parse stranger store: {error}"))?;
        value.version = 1;
        value.records.truncate(MAX_RECENT_STRANGERS);
        for record in &mut value.records {
            record.photos.truncate(MAX_PHOTOS_PER_STRANGER);
            record.embeddings.truncate(MAX_PHOTOS_PER_STRANGER);
        }
        Ok(value)
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("create stranger directory: {error}"))?;
        }
        let temporary = path.with_extension("json.tmp");
        let bytes = serde_json::to_vec(self)
            .map_err(|error| format!("serialize stranger store: {error}"))?;
        let mut file = fs::File::create(&temporary)
            .map_err(|error| format!("create stranger store: {error}"))?;
        file.write_all(&bytes)
            .and_then(|_| file.sync_all())
            .map_err(|error| format!("write stranger store: {error}"))?;
        fs::rename(&temporary, path).map_err(|error| format!("replace stranger store: {error}"))
    }

    pub fn summaries(&self) -> Vec<StrangerSummary> {
        self.records.iter().map(summary).collect()
    }

    pub fn match_or_create_id(&self, embedding: &[f32], request_id: u64, now_ms: i64) -> String {
        self.records
            .iter()
            .filter(|record| record.identity.is_none() && !record.embeddings.is_empty())
            .filter_map(|record| {
                centroid(&record.embeddings)
                    .map(|center| (record.id.as_str(), cosine(&center, embedding)))
            })
            .max_by(|left, right| left.1.total_cmp(&right.1))
            .filter(|(_, score)| *score >= CLUSTER_THRESHOLD)
            .map(|(id, _)| id.to_owned())
            .unwrap_or_else(|| format!("stranger-{now_ms}-{request_id}"))
    }

    pub fn should_retain_photo(&self, id: &str, now_ms: i64) -> bool {
        let Some(record) = self.records.iter().find(|record| record.id == id) else {
            return true;
        };
        record.identity.is_none()
            && record.photos.len() < MAX_PHOTOS_PER_STRANGER
            && record
                .photos
                .last()
                .is_none_or(|photo| now_ms - photo.captured_at_ms >= MIN_PHOTO_INTERVAL_MS)
    }

    pub fn touch(&mut self, id: &str, now_ms: i64) {
        let Some(index) = self.records.iter().position(|record| record.id == id) else {
            return;
        };
        let mut record = self.records.remove(index);
        record.last_seen_at_ms = now_ms;
        self.records.insert(0, record);
    }

    pub fn commit_photo(
        &mut self,
        id: String,
        embedding: &[f32],
        path: String,
        request_id: u64,
        now_ms: i64,
    ) -> Vec<String> {
        let index = self.records.iter().position(|record| record.id == id);
        let mut record = index
            .map(|value| self.records.remove(value))
            .unwrap_or_else(|| StrangerRecord {
                id,
                first_seen_at_ms: now_ms,
                last_seen_at_ms: now_ms,
                identity: None,
                relationship: None,
                photos: Vec::new(),
                embeddings: Vec::new(),
            });
        record.last_seen_at_ms = now_ms;
        if record.photos.len() < MAX_PHOTOS_PER_STRANGER {
            record.photos.push(StrangerPhoto {
                path,
                request_id,
                captured_at_ms: now_ms,
            });
            record.embeddings.push(embedding.to_vec());
        }
        self.records.insert(0, record);
        let mut evicted = Vec::new();
        while self.records.len() > MAX_RECENT_STRANGERS {
            if let Some(record) = self.records.pop() {
                evicted.extend(record.photos.into_iter().map(|photo| photo.path));
            }
        }
        evicted
    }

    pub fn label(
        &mut self,
        id: &str,
        identity: &str,
        relationship: &str,
        now_ms: i64,
    ) -> Result<StrangerLabel, String> {
        let identity = identity.trim();
        let relationship = relationship.trim();
        if identity.is_empty() || identity.chars().count() > 32 {
            return Err("身份名称需要 1 到 32 个字符".into());
        }
        if relationship.is_empty() || relationship.chars().count() > 32 {
            return Err("关系需要 1 到 32 个字符".into());
        }
        let record = self
            .records
            .iter_mut()
            .find(|record| record.id == id)
            .ok_or_else(|| "最近陌生人记录不存在".to_string())?;
        if let Some(existing) = record.identity.as_deref() {
            if existing != identity {
                return Err("已标记人物不能直接改名，请通过人物档案修改".into());
            }
        }
        let newly_labeled = record.identity.is_none();
        record.identity = Some(identity.to_owned());
        record.relationship = Some(relationship.to_owned());
        record.last_seen_at_ms = now_ms;
        Ok(StrangerLabel {
            summary: summary(record),
            embeddings: record.embeddings.clone(),
            newly_labeled,
        })
    }
}

fn summary(record: &StrangerRecord) -> StrangerSummary {
    StrangerSummary {
        id: record.id.clone(),
        first_seen_at_ms: record.first_seen_at_ms,
        last_seen_at_ms: record.last_seen_at_ms,
        identity: record.identity.clone(),
        relationship: record.relationship.clone(),
        photo_paths: record
            .photos
            .iter()
            .map(|photo| photo.path.clone())
            .collect(),
        photo_count: record.photos.len(),
    }
}

fn centroid(embeddings: &[Vec<f32>]) -> Option<Vec<f32>> {
    let dimension = embeddings.first()?.len();
    if dimension == 0
        || embeddings
            .iter()
            .any(|embedding| embedding.len() != dimension)
    {
        return None;
    }
    let mut center = vec![0.0; dimension];
    for embedding in embeddings {
        for (target, value) in center.iter_mut().zip(embedding) {
            *target += value;
        }
    }
    let norm = center.iter().map(|value| value * value).sum::<f32>().sqrt();
    (norm > 1e-6).then(|| center.into_iter().map(|value| value / norm).collect())
}

fn cosine(left: &[f32], right: &[f32]) -> f32 {
    if left.len() != right.len() || left.is_empty() {
        return -1.0;
    }
    let dot = left.iter().zip(right).map(|(a, b)| a * b).sum::<f32>();
    let left_norm = left.iter().map(|value| value * value).sum::<f32>().sqrt();
    let right_norm = right.iter().map(|value| value * value).sum::<f32>().sqrt();
    if left_norm <= 1e-6 || right_norm <= 1e-6 {
        -1.0
    } else {
        dot / (left_norm * right_norm)
    }
}

pub fn photo_path(root: &Path, id: &str, request_id: u64, face_index: usize) -> PathBuf {
    root.join(id).join(format!("{request_id}-{face_index}.jpg"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clusters_similar_faces_and_separates_different_faces() {
        let mut store = StrangerStore::default();
        store.commit_photo("first".into(), &[1.0, 0.0], "one.jpg".into(), 1, 1);
        assert_eq!(store.match_or_create_id(&[0.99, 0.01], 2, 2), "first");
        assert!(store
            .match_or_create_id(&[0.0, 1.0], 3, 3)
            .starts_with("stranger-"));
    }

    #[test]
    fn retains_only_ten_recent_people() {
        let mut store = StrangerStore::default();
        for index in 0..12 {
            store.commit_photo(
                format!("person-{index}"),
                &[1.0, 0.0],
                format!("{index}.jpg"),
                index,
                index as i64,
            );
        }
        assert_eq!(store.summaries().len(), MAX_RECENT_STRANGERS);
        assert_eq!(store.summaries()[0].id, "person-11");
    }
}
