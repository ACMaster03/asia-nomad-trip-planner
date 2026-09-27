import SwiftUI

/// Every token and component on one screen, in the current appearance — the iOS twin of
/// the web's /dev preview routes. Hold it next to the web app to check they match.
struct GalleryView: View {
    @Binding var appearance: Appearance

    @State private var tab: AppTab = .home
    @State private var chip = "Stays"
    @State private var note = ""
    @State private var toast: String?
    @State private var sheetOpen = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                header
                section("Type") { typeSamples }
                section("A card as screens use it") { journeyCard }
                section("Buttons") { buttons }
                section("Chips and pills") { pills }
                section("Notices") {
                    Notice(text: "Your partner added a stay in Hoi An.")
                    Notice(text: "Free cancellation ends tomorrow at 12:00.", kind: .warn)
                }
                section("Input") { Field(placeholder: "Add a note", text: $note) }
                section("Tab bar") {
                    // A sample only: the real bar belongs to the app shell (Shell/AppShell.swift).
                    GlassTabBar(selection: $tab) { toast = "Checked in to Da Lat" }
                        .padding(.top, 28)
                        .clipShape(.rect(cornerRadius: Radius.r))
                }
                section("Waiting on the network") {
                    HStack(spacing: 20) {
                        TravelLoader()
                        TravelLoader(color: Palette.on)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 18)
                            .background(Palette.ac, in: .rect(cornerRadius: Radius.rCtl))
                    }
                    WaitingNote(since: .now.addingTimeInterval(-10)) {}
                }
                section("Wash") { washSample }
                section("Colours") { swatches }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 40)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Palette.canvas)
        .livholdText()
        .toast($toast)
        .sheet(isPresented: $sheetOpen) { sampleSheet }
    }

    // MARK: sections

    private var header: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                Image("Mark").resizable().scaledToFit().frame(width: 44, height: 44)
                Text("Livhold").font(.serif(27)).tracking(-0.27)
                Spacer()
            }
            Picker("Appearance", selection: $appearance) {
                ForEach(Appearance.allCases) { Text($0.title).tag($0) }
            }
            .pickerStyle(.segmented)
            ExpandStylePicker()
            if !Typography.isAvailable(FontFamily.serif) || !Typography.isAvailable(FontFamily.sans) {
                Notice(text: "Lora / Work Sans not bundled yet — showing the system fallback.", kind: .warn)
            }
        }
        .padding(.top, 8)
    }

    private var typeSamples: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Da Lat, three nights").font(.serif(27)).tracking(-0.27)
            Text("Section heading 25").font(.serif(25))
            Text("Section heading 21").font(.serif(21))
            Text("Card title 19").font(.serif(19))
            Text("Body text in Work Sans, the way every paragraph and control reads on the web.")
            Text("₫1,284,500 · €48.20 · 12 nights").font(.sans(16, weight: .semibold))
            Text("Caption 13 in tx3").font(.sans(13, relativeTo: .caption)).foregroundStyle(Palette.tx3)
        }
    }

    private var journeyCard: some View {
        Card {
            HStack {
                SectionTitle("Today in Da Lat")
                Spacer()
                TagPill(title: "Day 42")
            }
            Text("Spent ₫640,000 of ₫900,000").foregroundStyle(Palette.tx2)
            ProgressTrack(value: 0.71)
            HStack(spacing: 10) {
                Avatar(name: "Petra")
                VStack(alignment: .leading, spacing: 2) {
                    Text("Petra checked in").font(.sans(16, weight: .semibold))
                    Text("Linh Phuoc Pagoda · 2h ago").font(.sans(13, relativeTo: .caption)).foregroundStyle(Palette.tx3)
                }
                Spacer()
                CountBadge(count: 3)
            }
            .padding(.top, 4)
        }
    }

    private var buttons: some View {
        VStack(spacing: 12) {
            Button("Save stay") { toast = "Stay saved" }.buttonStyle(.primary)
            Button("Save stay") {}.buttonStyle(.primary).disabled(true)
            // Quiet buttons are drawn in canvas, so like on the web they only show on a card.
            Card {
                HStack(spacing: 12) {
                    Button("Open a sheet") { sheetOpen = true }.buttonStyle(.quiet)
                    Button { toast = "Shared" } label: { Image(systemName: "square.and.arrow.up") }.buttonStyle(.icon)
                    Spacer()
                }
            }
            Button("Leave this journey") {}.buttonStyle(.danger)
        }
    }

    private var pills: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                ForEach(["Stays", "Transport", "Daily"], id: \.self) { name in
                    Chip(title: name, selected: chip == name) { chip = name }
                }
            }
            HStack(spacing: 8) {
                TagPill(title: "Vietnam")
                TagPill(title: "3 nights")
                FillPill(title: "4", systemImage: "bubble.left")
                FillPill(title: "12", systemImage: "heart")
            }
        }
    }

    private var washSample: some View {
        VStack(spacing: 6) {
            Text("Welcome back")
                .font(.serif(25))
                .multilineTextAlignment(.center)
                .foregroundStyle(Palette.washInk)
                .padding(.top, 28)
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .frame(height: 260)
        .wash(Wash.login)
        .clipShape(.rect(cornerRadius: Radius.r))
    }

    private var swatches: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 76), spacing: 10)], spacing: 12) {
            ForEach(Palette.all, id: \.name) { token in
                VStack(spacing: 4) {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(token.color)
                        .frame(height: 44)
                        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.ln2, lineWidth: 1))
                    Text(token.name).font(.sans(11, relativeTo: .caption2)).foregroundStyle(Palette.tx3)
                }
            }
        }
    }

    private var sampleSheet: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionTitle("Add an expense", size: 21)
            HStack(spacing: 8) {
                ForEach(["Stays", "Transport", "Daily"], id: \.self) { name in
                    Chip(title: name, selected: chip == name) { chip = name }
                }
            }
            Field(placeholder: "Amount", text: $note)
            Button("Save") {
                sheetOpen = false
                toast = "Expense saved"
            }
            .buttonStyle(.primary)
            Spacer()
        }
        .padding(20)
        .padding(.top, 8)
        .livholdSheet()
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title.uppercased())
                .font(.sans(12, weight: .semibold, relativeTo: .caption2))
                .tracking(0.6)
                .foregroundStyle(Palette.tx3)
            content()
        }
    }
}

#Preview("Light") {
    GalleryView(appearance: .constant(.light)).preferredColorScheme(.light)
}

#Preview("Dark") {
    GalleryView(appearance: .constant(.dark)).preferredColorScheme(.dark)
}

/// How cards open, on trial (Components/Motion.swift ExpandStyle): pick one and
/// try it here, then on Money's Plan, Bookings and Subscriptions.
private struct ExpandStylePicker: View {
    @AppStorage("motion.expand") private var style: ExpandStyle = .fade
    @State private var open = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Cards open").font(.sans(13, weight: .semibold)).foregroundStyle(Palette.tx3)
            Picker("Cards open", selection: $style) {
                ForEach(ExpandStyle.allCases) { Text($0.title).tag($0) }
            }
            .pickerStyle(.segmented)
            Text(style.detail).font(.sans(13)).foregroundStyle(Palette.tx2)
            VStack(alignment: .leading, spacing: 0) {
                Button { withAnimation(Motion.settle) { open.toggle() } } label: {
                    HStack {
                        Text("Try it: Bangkok").font(.sans(15, weight: .medium)).foregroundStyle(Palette.tx)
                        Spacer()
                        Image(systemName: "chevron.down").font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Palette.tx3).rotationEffect(.degrees(open ? 180 : 0))
                    }
                    .padding(.vertical, 12)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                if open {
                    VStack(spacing: 8) {
                        ForEach(["Already spent here", "2 nights left × 4601", "The stay, paid", "Together"], id: \.self) { line in
                            HStack { Text(line); Spacer(); Text("—") }.font(.sans(13)).foregroundStyle(Palette.tx2)
                        }
                    }
                    .padding(10)
                    .background(Palette.canvas, in: .rect(cornerRadius: 12))
                    .padding(.bottom, 10)
                    .expands()
                }
            }
            .padding(.horizontal, 14)
            .background(Palette.sf, in: .rect(cornerRadius: 16))
            .clipped()
        }
    }
}
