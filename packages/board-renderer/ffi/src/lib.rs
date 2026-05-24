use std::slice;
use board_renderer_core::renderer::render_overlay;
use board_renderer_core::types::RenderConfig;

/// Render a board overlay from a JSON config string.
///
/// Returns 0 on success, -1 on JSON parse error, -2 on render error.
/// On success, `out_data` points to heap-allocated RGBA pixel data,
/// `out_len` is the byte length, and `out_width`/`out_height` are dimensions.
/// The caller must free the data with `board_renderer_free`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn board_renderer_render(
    config_json: *const u8,
    config_json_len: u32,
    out_data: *mut *mut u8,
    out_len: *mut u32,
    out_width: *mut u32,
    out_height: *mut u32,
) -> i32 {
    if config_json.is_null() || out_data.is_null() || out_len.is_null()
        || out_width.is_null() || out_height.is_null()
    {
        return -1;
    }

    let json_bytes = unsafe { slice::from_raw_parts(config_json, config_json_len as usize) };
    let json_str = match std::str::from_utf8(json_bytes) {
        Ok(s) => s,
        Err(_) => return -1,
    };

    let config: RenderConfig = match serde_json::from_str(json_str) {
        Ok(c) => c,
        Err(_) => return -1,
    };

    match render_overlay(&config) {
        Ok((rgba_data, width, height)) => {
            let mut boxed = rgba_data.into_boxed_slice();
            unsafe {
                *out_data = boxed.as_mut_ptr();
                *out_len = boxed.len() as u32;
                *out_width = width;
                *out_height = height;
            }
            std::mem::forget(boxed);
            0
        }
        Err(_) => -2,
    }
}

/// Free memory previously allocated by `board_renderer_render`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn board_renderer_free(ptr: *mut u8, len: u32) {
    if !ptr.is_null() && len > 0 {
        drop(unsafe { Vec::from_raw_parts(ptr, len as usize, len as usize) });
    }
}
