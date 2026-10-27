use crate::envelope::BridgeMessage;

pub fn format_inject(message: &BridgeMessage) -> String {
    let mut lines = vec![
        "[Agent Bridge]".to_string(),
        format!("kind: {}", kind_wire(message.kind)),
        format!("id: {}", message.id),
        format!(
            "from: provider={}{}",
            message.from.provider_id,
            message
                .from
                .chat_id
                .as_deref()
                .map(|id| format!(" chat={id}"))
                .unwrap_or_default()
        ),
        format!(
            "to: provider={}{}",
            message.to.provider_id,
            message
                .to
                .chat_id
                .as_deref()
                .map(|id| format!(" chat={id}"))
                .unwrap_or_default()
        ),
    ];
    if let Some(cid) = &message.correlation_id {
        lines.push(format!("correlation_id: {cid}"));
    }
    if let Some(r) = &message.context_ref {
        lines.push(format!("context_ref: {r}"));
        lines.push("Pull the bag with: atmos agent-bridge status --context-ref <ref>".into());
    }
    lines.push(String::new());
    lines.push(message.body.clone());
    lines.join("\n")
}

fn kind_wire(kind: crate::envelope::MessageKind) -> &'static str {
    match kind {
        crate::envelope::MessageKind::Send => "send",
        crate::envelope::MessageKind::Request => "request",
        crate::envelope::MessageKind::Reply => "reply",
        crate::envelope::MessageKind::Ack => "ack",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::address::AgentAddress;
    use crate::envelope::{BridgeMessage, MessageKind};

    #[test]
    fn render_includes_kind_and_body() {
        let msg = BridgeMessage::new(
            MessageKind::Request,
            AgentAddress::new("local", "cli"),
            AgentAddress::new("local", "claude"),
            "please review",
        );
        let text = format_inject(&msg);
        assert!(text.contains("[Agent Bridge]"));
        assert!(text.contains("kind: request"));
        assert!(text.contains("please review"));
    }
}
