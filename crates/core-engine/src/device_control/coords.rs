use crate::error::{EngineError, Result};

/// Normalized Device Preview coordinate. Inclusive `0.0..=1.0`, top-left origin.
pub fn validate_coord(value: f64) -> Result<f64> {
    if (0.0..=1.0).contains(&value) {
        Ok(value)
    } else {
        Err(EngineError::Processing(format!(
            "invalid coords: {value} is outside 0.0..=1.0"
        )))
    }
}

pub fn validate_point(x: f64, y: f64) -> Result<(f64, f64)> {
    Ok((validate_coord(x)?, validate_coord(y)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_inclusive_unit_range() {
        assert_eq!(validate_coord(0.0).unwrap(), 0.0);
        assert_eq!(validate_coord(1.0).unwrap(), 1.0);
        assert_eq!(validate_coord(0.5).unwrap(), 0.5);
        assert!(validate_point(0.0, 1.0).is_ok());
    }

    #[test]
    fn rejects_outside_range_and_non_finite() {
        for value in [-0.1, 1.01, f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            let err = validate_coord(value).unwrap_err().to_string();
            assert!(
                err.contains("invalid coords"),
                "expected invalid coords, got {err}"
            );
        }
        assert!(validate_point(1.5, 0.5).is_err());
        assert!(validate_point(0.5, -0.01).is_err());
    }
}
