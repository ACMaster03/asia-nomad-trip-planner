import SwiftUI

/// Choice chip. Web: `rounded-full border-[1.4px] border-ln3 px-3 py-1.5 text-base font-medium text-tx2`;
/// selected: `border-ac bg-ac-soft`.
struct Chip: View {
    let title: String
    var selected = false
    var action: () -> Void = {}

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.sans(16, weight: .medium))
                .foregroundStyle(Palette.tx2)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(selected ? Palette.acSoft : .clear, in: .capsule)
                .overlay(Capsule().strokeBorder(selected ? Palette.ac : Palette.ln3, lineWidth: 1.4))
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.selection, trigger: selected)
    }
}

/// Label pill. Web: `rounded-full bg-tag px-3 py-1 text-[13px] font-medium text-tag-ink`.
struct TagPill: View {
    let title: String

    var body: some View {
        Text(title)
            .font(.sans(13, weight: .medium, relativeTo: .caption))
            .foregroundStyle(Palette.tagInk)
            .lineLimit(1)
            .padding(.horizontal, 12)
            .padding(.vertical, 4)
            .background(Palette.tag, in: .capsule)
    }
}

/// Small filled count. Web: `h-8 rounded-full bg-fill px-2.5 text-[13px] font-semibold text-tx2`.
struct FillPill: View {
    let title: String
    var systemImage: String?

    var body: some View {
        Label {
            Text(title)
        } icon: {
            if let systemImage { Image(systemName: systemImage) }
        }
        .labelStyle(.titleAndIcon)
        .font(.sans(13, weight: .semibold, relativeTo: .caption))
        .foregroundStyle(Palette.tx2)
        .padding(.horizontal, 10)
        .frame(height: 32)
        .background(Palette.fill, in: .capsule)
    }
}

/// Person initial. Web: `h-[42px] w-[42px] rounded-full bg-ac2-soft text-[17px] font-semibold text-ac2-deep`.
struct Avatar: View {
    let name: String
    var size: CGFloat = 42

    var body: some View {
        Text(name.prefix(1).uppercased())
            .font(.sans(size * 0.4, weight: .semibold))
            .foregroundStyle(Palette.ac2Deep)
            .frame(width: size, height: size)
            .background(Palette.ac2Soft, in: .circle)
    }
}

/// Unread / count dot. Web: `h-[22px] w-[22px] rounded-full bg-ac2 text-on`.
struct CountBadge: View {
    let count: Int

    var body: some View {
        Text("\(count)")
            .font(.sans(12, weight: .semibold, relativeTo: .caption2))
            .foregroundStyle(Palette.on)
            .frame(minWidth: 22, minHeight: 22)
            .background(Palette.ac2, in: .circle)
    }
}
