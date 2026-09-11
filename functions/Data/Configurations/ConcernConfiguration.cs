using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Data.Configurations;

// ── C-3. Concerns（docs/08-database.md §C-3）──────────────────────────────

public sealed class ConcernConfiguration : IEntityTypeConfiguration<Concern>
{
    public void Configure(EntityTypeBuilder<Concern> b)
    {
        b.ToTable("Concerns");

        // Symptoms／Causes／SelfCheckGuide／WhenToSeeDoctor：真正的長文，nvarchar(max)。

        b.OwnsImage(x => x.Cover, "Cover");
    }
}
